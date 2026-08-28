/*
  ==============================================================================

    This file contains the basic startup code for a JUCE application.

  ==============================================================================
*/

#include <JuceHeader.h>
#include <cstdlib>
#if JUCE_WINDOWS
 #include <Windows.h>
#endif
#include "Communication/EngineAPI.h"
#include "Communication/WebGateway.h"
#include "UI/EngineHostComponent.h"
#include "UI/MainComponent.h"

namespace
{
    void useSoftwareRenderer (juce::Component& window)
    {
       #if JUCE_WINDOWS
        if (auto* peer = window.getPeer())
            if (peer->getAvailableRenderingEngines().contains ("Software Renderer"))
                peer->setCurrentRenderingEngine (0);
       #else
        juce::ignoreUnused (window);
       #endif
    }

    /** JUCE FileLogger also calls OutputDebugString.  Under the Visual Studio debugger
        that call waits until the IDE consumes the string, so loading BBCSO / Synchron
        (or even writing the next log line) can freeze F5 indefinitely.
    */
    class DawFileLogger  : public juce::Logger
    {
    public:
        explicit DawFileLogger (juce::File fileToUse)
            : logFile (std::move (fileToUse))
        {
            juce::FileLogger::trimFileSize (logFile, 256 * 1024);
            logMessage ("DawWeb");
        }

        void logMessage (const juce::String& message) override
        {
            const juce::ScopedLock sl (lock);
            juce::FileOutputStream out (logFile, 4096);

            if (! out.openedOk())
                return;

            out << juce::Time::getCurrentTime().formatted ("%H:%M:%S") << "  "
                << message << juce::newLine;
            out.flush();
        }

    private:
        juce::File logFile;
        juce::CriticalSection lock;
    };

    class HeartbeatTimer  : public juce::Timer
    {
    public:
        void timerCallback() override
        {
            juce::Logger::writeToLog ("engine heartbeat");
        }
    };

    class KeepAliveAnchor  : public juce::Component
    {
    public:
        KeepAliveAnchor()
        {
            setSize (8, 8);
            addToDesktop (0);
            setTopLeftPosition (-32000, -32000);
            setVisible (true);
        }
    };
}

//==============================================================================
class NewProjectApplication  : public juce::JUCEApplication
{
public:
    //==============================================================================
    NewProjectApplication() {}

    const juce::String getApplicationName() override       { return ProjectInfo::projectName; }
    const juce::String getApplicationVersion() override    { return ProjectInfo::versionString; }
    bool moreThanOneInstanceAllowed() override             { return true; }

    bool keepAlive = false;
    bool openBrowser = false;
    bool headless = false;

    //==============================================================================
    void initialise (const juce::String& commandLine) override
    {
        const auto logDir = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                                .getChildFile ("DawWeb");
        logDir.createDirectory();
        fileLogger = std::make_unique<DawFileLogger> (logDir.getChildFile ("dawweb.log"));
        juce::Logger::setCurrentLogger (fileLogger.get());
        juce::Logger::writeToLog (juce::Process::isRunningUnderDebugger()
                                      ? "Started under debugger"
                                      : "Started");

        keepAlive = commandLine.containsIgnoreCase ("--keep-alive")
                    || commandLine.containsIgnoreCase ("--headless");
        headless = commandLine.containsIgnoreCase ("--headless");
        openBrowser = ! headless && ! commandLine.containsIgnoreCase ("--no-browser");

        if (commandLine.containsIgnoreCase ("--probe-vst3")
            || commandLine.containsIgnoreCase ("--dump-state")
            || commandLine.containsIgnoreCase ("--audio-test")
            || commandLine.containsIgnoreCase ("--regression"))
        {
            engineApi = std::make_unique<EngineAPI>();
            const auto command = commandLine;
            juce::MessageManager::callAsync ([this, command, logDir]
            {
                if (command.containsIgnoreCase ("--regression"))
                    logDir.getChildFile ("phase45-regression.txt").replaceWithText ("initialise starting\n");

                if (engineApi != nullptr)
                    engineApi->initialise();

                if (command.containsIgnoreCase ("--regression"))
                    logDir.getChildFile ("phase45-regression.txt").replaceWithText ("initialise ok\n");

                if (command.containsIgnoreCase ("--probe-vst3"))
                    runVst3Probe (logDir.getChildFile ("phase4-probe.txt"));
                else if (command.containsIgnoreCase ("--dump-state"))
                    runStateDump (logDir.getChildFile ("phase4-state-dump.txt"));
                else if (command.containsIgnoreCase ("--regression"))
                    runApiRegression (logDir.getChildFile ("phase45-regression.txt"));
                else
                    runAudioTest (logDir.getChildFile ("phase45-audio-test.txt"));

                if (! keepAlive)
                    finishProbeAndExit();
            });
            return;
        }

        if (commandLine.containsIgnoreCase ("--native"))
        {
            mainWindow.reset (new MainWindow (getApplicationName(), nullptr, keepAlive));
            return;
        }

        if (headless || commandLine.containsIgnoreCase ("--web-only"))
        {
            startWebHost();
            return;
        }

        startSharedHost();
    }

    void shutdown() override
    {
        heartbeat = nullptr;
        keepAliveAnchor = nullptr;
        mainWindow = nullptr;
        hostWindow = nullptr;
        webGateway = nullptr;
        engineApi = nullptr;
        juce::Logger::setCurrentLogger (nullptr);
        fileLogger.reset();
    }

    //==============================================================================
    void systemRequestedQuit() override
    {
        if (keepAlive)
        {
            juce::Logger::writeToLog ("Quit ignored (--keep-alive / --headless)");
            return;
        }

        quit();
    }

    void finishProbeAndExit()
    {
        if (engineApi != nullptr)
        {
            engineApi->getEngine().detachAudioCallback();
            engineApi->flushRetiredInstruments();
        }

        juce::Logger::writeToLog ("probe complete; exiting without VST teardown");
        juce::Logger::setCurrentLogger (nullptr);
        fileLogger.reset();
       #if JUCE_WINDOWS
        ::ExitProcess (0);
       #else
        std::_Exit (0);
       #endif
    }

    void anotherInstanceStarted (const juce::String&) override {}

    //==============================================================================
    class MainWindow    : public juce::DocumentWindow
    {
    public:
        MainWindow (juce::String name, EngineAPI* sharedEngine = nullptr, bool stayOpen = false)
            : DocumentWindow (name, juce::Colour (0xff121212), DocumentWindow::allButtons),
              ignoreClose (stayOpen)
        {
            setUsingNativeTitleBar (true);
            setContentOwned (sharedEngine != nullptr ? new MainComponent (*sharedEngine)
                                                     : new MainComponent(),
                             true);

           #if JUCE_IOS || JUCE_ANDROID
            setFullScreen (true);
           #else
            setResizable (true, true);
            setResizeLimits (1100, 640, 10000, 10000);
            centreWithSize (getWidth(), getHeight());
           #endif

            addToDesktop (getDesktopWindowStyleFlags());
            useSoftwareRenderer (*this);
            setVisible (true);
        }

        void closeButtonPressed() override
        {
            if (ignoreClose)
                return;

            JUCEApplication::getInstance()->systemRequestedQuit();
        }

    private:
        bool ignoreClose = false;
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainWindow)
    };

    class EngineHostWindow  : public juce::DocumentWindow
    {
    public:
        EngineHostWindow (EngineAPI& api, WebGateway& gateway)
            : DocumentWindow ("DawWeb Engine", juce::Colour (0xff121212), DocumentWindow::allButtons)
        {
            setUsingNativeTitleBar (true);
            setContentOwned (new EngineHostComponent (api, gateway), true);
            setResizable (false, false);
            centreWithSize (680, 400);
            addToDesktop (getDesktopWindowStyleFlags());
            useSoftwareRenderer (*this);
            setVisible (true);
        }

        void closeButtonPressed() override
        {
            if (ignoreClose)
                return;

            JUCEApplication::getInstance()->systemRequestedQuit();
        }

        void setIgnoreClose (bool shouldIgnore) noexcept { ignoreClose = shouldIgnore; }

    private:
        bool ignoreClose = false;
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EngineHostWindow)
    };

    void startWebHost()
    {
        engineApi = std::make_unique<EngineAPI>();
        webGateway = std::make_unique<WebGateway> (*engineApi);
        juce::MessageManager::callAsync ([this]
        {
            finishEngineServices (openBrowser, ! headless);

            if (headless)
            {
                keepAliveAnchor = std::make_unique<KeepAliveAnchor>();
                heartbeat = std::make_unique<HeartbeatTimer>();
                heartbeat->startTimer (15000);
                juce::Logger::writeToLog ("Headless keep-alive: quit requests ignored");
            }
            else
            {
                hostWindow.reset (new EngineHostWindow (*engineApi, *webGateway));
                hostWindow->setIgnoreClose (keepAlive);
            }
        });
    }

    void startSharedHost()
    {
        engineApi = std::make_unique<EngineAPI>();
        webGateway = std::make_unique<WebGateway> (*engineApi);
        mainWindow.reset (new MainWindow (getApplicationName(), engineApi.get(), keepAlive));
        juce::MessageManager::callAsync ([this] { finishEngineServices (openBrowser, false); });
    }

    void finishEngineServices (bool shouldOpenBrowser, bool starterContent)
    {
        if (engineApi == nullptr || webGateway == nullptr)
            return;

        juce::Logger::writeToLog ("Opening audio device...");
        const auto audioError = engineApi->initialise();

        if (audioError.isNotEmpty())
            juce::Logger::writeToLog ("Audio engine: " + audioError);

        if (starterContent)
            engineApi->ensureStarterContent();

        juce::Logger::writeToLog ("Starting web gateway...");
        webGateway->start();

        if (! webGateway->isListening())
            return;

        const auto url = webGateway->getListenUrl();

        if (shouldOpenBrowser && ! juce::Process::isRunningUnderDebugger())
            juce::Timer::callAfterDelay (250, [url] { juce::URL (url).launchInDefaultBrowser(); });
        else
            juce::Logger::writeToLog ("UI available at " + url
                                      + (juce::Process::isRunningUnderDebugger()
                                             ? " (browser not auto-opened under debugger)"
                                             : ""));
    }

    void runStateDump (const juce::File& reportFile)
    {
        auto& api = *engineApi;
        juce::String report;
        report << "Phase 4 state dump\n";
        report << "Audio: " << api.getEngine().getStatusDescription() << "\n";
        report << api.getInstruments().getStartupStatus() << "\n";
        report << api.dumpDefaultPluginStates() << "\n";
        reportFile.replaceWithText (report);
        juce::Logger::writeToLog (report);
    }

    void runAudioTest (const juce::File& reportFile)
    {
        auto& api = *engineApi;
        juce::String report;
        const auto flush = [&]
        {
            reportFile.replaceWithText (report);
        };

        report << "Phase 4.5 audio / state validation\n";
        report << "Audio: " << api.getEngine().getStatusDescription() << "\n";
        report << api.getInstruments().getStartupStatus() << "\n";
        report << "piano-adopt=" << (api.tryRecaptureFactoryPreset ("bbcso_piano") ? "ok" : "failed") << "\n";
        flush();

        int index = -1;

        for (int i = 0; i < api.getProject().getNumTracks(); ++i)
            if (const auto* track = api.getProject().getTrack (i))
                if (track->isMidi() && ! track->isMaster())
                {
                    index = i;
                    break;
                }

        if (index < 0)
            index = api.getProject().addTrack (TrackType::Midi, "AudioTest", juce::Colour (0xff4a90d9));

        if (const auto* track = api.getProject().getTrack (index))
            report << "testTrack=" << index
                   << " numTracks=" << api.getProject().getNumTracks()
                   << " master=" << (track->isMaster() ? "yes" : "no")
                   << " midi=" << (track->isMidi() ? "yes" : "no")
                   << " type=" << (int) track->type << "\n";
        else
            report << "testTrack=" << index << " missing, numTracks="
                   << api.getProject().getNumTracks() << "\n";
        flush();

        const char* sequence[] = { "bbcso_violin_1", "piano_bbcso", "soft_imperial",
                                   "celestial_strings", "small_percussion", "angelic_choir" };

        for (const auto* definitionId : sequence)
        {
            report << "\n=== " << definitionId << " ===\n";
            const bool isSynchron = juce::String (definitionId) != "bbcso_violin_1"
                                    && juce::String (definitionId) != "piano_bbcso";
            api.unloadTrackInstrument (index);
            api.flushRetiredInstruments();

            if (isSynchron)
                api.getEngine().detachAudioCallback();

            api.loadTrackInstrument (index, definitionId, false);

            if (const auto* track = api.getProject().getTrack (index))
            {
                report << instrumentLoadStateLabel (track->instrumentLoadState) << "\n"
                       << track->instrumentLoadMessage << "\n"
                       << "preset=" << track->presetId << "\n";

                if (track->instrumentLoadState == InstrumentLoadState::Loaded
                    || track->instrumentLoadState == InstrumentLoadState::Active)
                {
                    flush();
                    if (! isSynchron)
                    {
                        api.playValidationPhrase (index, 80, true);

                        if (auto* instance = api.getEngine().getTrackInstrument (index))
                            report << "plugin=" << instance->getDisplayName()
                                   << " version=" << instance->getPluginVersion() << "\n";
                    }
                    else
                    {
                        report << "plugin=Synchron Player (MIDI skipped; audio callback detached after restore)\n";
                    }
                }
            }

            flush();
            api.unloadTrackInstrument (index);
            api.flushRetiredInstruments();
        }

        api.getEngine().attachAudioCallback();

        report << "\n=== violin long vs spiccato ===\n";
        api.loadTrackInstrument (index, "bbcso_violin_1", false);
        api.setTrackTechnique (index, "bbcso_long");
        if (const auto* track = api.getProject().getTrack (index))
        {
            report << "long: " << instrumentLoadStateLabel (track->instrumentLoadState)
                   << "  " << track->instrumentLoadMessage << "  preset=" << track->presetId << "\n";
            if (track->instrumentLoadState == InstrumentLoadState::Loaded
                || track->instrumentLoadState == InstrumentLoadState::Active)
                api.playValidationPhrase (index, 80, true);
        }
        api.setTrackTechnique (index, "bbcso_spiccato");
        if (const auto* track = api.getProject().getTrack (index))
        {
            report << "spiccato: " << instrumentLoadStateLabel (track->instrumentLoadState)
                   << "  " << track->instrumentLoadMessage << "  preset=" << track->presetId << "\n";
            if (track->instrumentLoadState == InstrumentLoadState::Loaded
                || track->instrumentLoadState == InstrumentLoadState::Active)
                api.playValidationPhrase (index, 80, true);
        }
        flush();

        report << "\n=== piano fresh instance + switch ===\n";
        api.unloadTrackInstrument (index);
        api.loadTrackInstrument (index, "piano_bbcso", false);
        if (const auto* track = api.getProject().getTrack (index))
            report << "piano-1: " << instrumentLoadStateLabel (track->instrumentLoadState)
                   << "  " << track->instrumentLoadMessage << "  preset=" << track->presetId << "\n";
        if (const auto* track = api.getProject().getTrack (index))
            if (track->instrumentLoadState == InstrumentLoadState::Loaded
                || track->instrumentLoadState == InstrumentLoadState::Active)
            {
                api.playValidationPhrase (index, 40, true);
                api.playValidationPhrase (index, 80, true);
                api.playValidationPhrase (index, 120, true);
            }
        api.loadTrackInstrument (index, "bbcso_violin_1", false);
        if (const auto* track = api.getProject().getTrack (index))
            report << "violin-switch: " << instrumentLoadStateLabel (track->instrumentLoadState)
                   << "  " << track->instrumentLoadMessage << "  preset=" << track->presetId << "\n";
        api.loadTrackInstrument (index, "piano_bbcso", false);
        if (const auto* track = api.getProject().getTrack (index))
            report << "piano-2: " << instrumentLoadStateLabel (track->instrumentLoadState)
                   << "  " << track->instrumentLoadMessage << "  preset=" << track->presetId << "\n";
        if (const auto* track = api.getProject().getTrack (index))
            if (track->instrumentLoadState == InstrumentLoadState::Loaded
                || track->instrumentLoadState == InstrumentLoadState::Active)
                api.playValidationPhrase (index, 80, true);
        flush();

        report << "\n=== 7-track project roundtrip ===\n";
        flush();
        api.getEngine().detachAudioCallback();
        const char* trackDefs[] = { "bbcso_violin_1", "bbcso_violin_1", "piano_bbcso",
                                    "soft_imperial", "celestial_strings", "small_percussion", "angelic_choir" };
        const char* trackNames[] = { "Violin I Long", "Violin I Spiccato", "Piano",
                                     "Soft Imperial", "Celestial Strings", "Small Percussion", "Angelic Choir" };

        for (int i = 0; i < 7; ++i)
        {
            const int trackIndex = i == 0 ? index
                : api.getProject().addTrack (TrackType::Midi, trackNames[i], juce::Colour (0xff4a90d9));

            if (i == 0)
                api.getProject().getTrack (trackIndex)->name = trackNames[0];

            api.loadTrackInstrument (trackIndex, trackDefs[i], false);

            if (i == 1)
                api.setTrackTechnique (trackIndex, "bbcso_spiccato");
        }

        const auto projectFile = reportFile.getSiblingFile ("phase45-roundtrip.dawweb");

        if (api.saveProjectToFile (projectFile))
        {
            report << "saved " << projectFile.getFileName() << " (" << projectFile.getSize() << " bytes)\n";
            flush();
            const auto loadError = api.loadProjectFromFile (projectFile);
            api.getEngine().detachAudioCallback();
            report << (loadError.isNotEmpty() ? ("load error: " + loadError)
                                              : ("load returned ok, tracks=" + juce::String (api.getProject().getNumTracks())))
                   << "\n";
            flush();

            if (loadError.isEmpty())
            {
                for (int i = 1; i < api.getProject().getNumTracks(); ++i)
                    if (const auto* track = api.getProject().getTrack (i))
                        report << track->name << "  "
                               << instrumentLoadStateLabel (track->instrumentLoadState) << "  "
                               << track->instrumentLoadMessage << "  preset=" << track->presetId << "\n";
            }
        }
        else
        {
            report << "save failed\n";
        }

        flush();
        juce::Logger::writeToLog (report);
        // Skip plugin teardown — Synchron/BBCSO dtors can AV after a 7-instance
        // restore. finishProbeAndExit() uses ExitProcess(0).
        api.getEngine().detachAudioCallback();
    }

    void runVst3Probe (const juce::File& reportFile)
    {
        auto& api = *engineApi;
        juce::String report;
        report << "Phase 4 VST3 probe\n";
        report << "Audio: " << api.getEngine().getStatusDescription() << "\n";
        report << api.getInstruments().getStartupStatus() << "\n";
        report << api.getEngine().getPluginHost().inspectApprovedPlugins() << "\n";

        for (const auto& warning : api.getInstruments().getResourceWarnings())
            report << "Warning: " << warning << "\n";

        const int index = api.getProject().addTrack (TrackType::Midi, "Probe", juce::Colour (0xff4a90d9));
        const char* sequence[] = { "bbcso_violin_1", "piano_bbcso", "soft_imperial",
                                   "celestial_strings", "small_percussion", "angelic_choir" };

        report << "piano-adopt=" << (api.tryRecaptureFactoryPreset ("bbcso_piano") ? "ok" : "failed") << "\n";
        reportFile.replaceWithText (report);

        for (const auto* definitionId : sequence)
        {
            report << "\n--- load " << definitionId << " ---\n";
            api.unloadTrackInstrument (index);
            api.pumpUi (50);

            api.loadTrackInstrument (index, definitionId, false);
            api.pumpUi (100);

            if (const auto* track = api.getProject().getTrack (index))
            {
                report << instrumentLoadStateLabel (track->instrumentLoadState) << "\n"
                       << track->instrumentLoadMessage << "\n";

                if (auto* instance = api.getEngine().getTrackInstrument (index))
                    report << instance->getIntrospectionSummary() << "\n";
            }

            api.unloadTrackInstrument (index);
            reportFile.replaceWithText (report);
        }

        report << "\n--- project save/load ---\n";
        api.loadTrackInstrument (index, "piano_bbcso", false);
        const auto projectFile = reportFile.getSiblingFile ("phase4-roundtrip.dawweb");

        if (api.saveProjectToFile (projectFile))
        {
            report << "saved " << projectFile.getFileName() << " (" << projectFile.getSize() << " bytes)\n";
            const auto loadError = api.loadProjectFromFile (projectFile);

            if (loadError.isNotEmpty())
                report << "load error: " << loadError << "\n";
            else if (const auto* track = api.getProject().getTrack (index))
                report << instrumentLoadStateLabel (track->instrumentLoadState) << "  "
                       << track->instrumentLoadMessage << "  preset=" << track->presetId << "\n";
        }
        else
        {
            report << "save failed\n";
        }

        reportFile.replaceWithText (report);
        juce::Logger::writeToLog (report);
    }

    void runApiRegression (const juce::File& reportFile)
    {
        auto& api = *engineApi;
        juce::String report;
        int pass = 0, fail = 0;
        report << "Pre-Phase-7 API regression\n";

        const auto flush = [&] { reportFile.replaceWithText (report); };
        const auto call = [&] (const juce::String& json) { return api.handleMessage (json); };
        const auto step = [&] (const juce::String& name, const juce::var& reply, bool expectOk)
        {
            const bool ok = (bool) reply.getProperty ("ok", false);
            const bool hit = expectOk ? ok : ! ok;
            report << (hit ? "PASS" : "FAIL") << "  " << name;
            if (! hit)
                report << "  " << reply.getProperty ("error", juce::var()).toString();
            report << "\n";
            hit ? ++pass : ++fail;
            flush();
        };

        step ("session.state", call ("{\"type\":\"session.state\"}"), true);
        step ("diagnostics.ping", call ("{\"type\":\"diagnostics.ping\",\"tClient\":1}"), true);
        step ("diagnostics.getMetrics", call ("{\"type\":\"diagnostics.getMetrics\"}"), true);
        step ("audio.getStatus", call ("{\"type\":\"audio.getStatus\"}"), true);
        step ("unknown.command", call ("{\"type\":\"not.a.command\"}"), false);
        step ("unknown.track", call ("{\"type\":\"instrument.load\",\"trackId\":99999,\"definitionId\":\"bbcso_violin_1\"}"), false);
        step ("unknown.instrument", call ("{\"type\":\"instrument.load\",\"trackId\":1,\"definitionId\":\"not_an_instrument\"}"), false);
        step ("transport.setBpm", call ("{\"type\":\"transport.setBpm\",\"bpm\":96}"), true);
        step ("transport.setLoop", call ("{\"type\":\"transport.setLoop\",\"enabled\":true,\"startBeats\":0,\"endBeats\":8}"), true);

        const auto created = call ("{\"type\":\"track.create\",\"name\":\"Regression\",\"trackType\":\"midi\"}");
        step ("track.create", created, true);
        const int trackId = (int) created.getProperty ("trackId", 0);
        const auto clip = call ("{\"type\":\"clip.create\",\"trackId\":"
                                + juce::String (trackId) + ",\"start\":0,\"length\":4,\"name\":\"Phrase\",\"sketch\":true}");
        step ("clip.create", clip, true);
        const int clipId = (int) clip.getProperty ("clipId", 0);
        step ("note.create", call ("{\"type\":\"note.create\",\"clipId\":"
                                   + juce::String (clipId) + ",\"pitch\":64,\"start\":0,\"duration\":1,\"velocity\":96}"), true);

        step ("sampler.load", call ("{\"type\":\"sampler.load\",\"trackId\":"
                                    + juce::String (trackId) + ",\"name\":\"Web Sampler\"}"), true);
        step ("sampler.unload", call ("{\"type\":\"sampler.unload\",\"trackId\":"
                                     + juce::String (trackId) + "}"), true);
        step ("mixer.setWebMixer", call ("{\"type\":\"mixer.setWebMixer\",\"webMixer\":{\"version\":1}}"), true);

        const auto projectFile = reportFile.getSiblingFile ("phase45-regression.dawweb");
        auto* saveObj = new juce::DynamicObject();
        saveObj->setProperty ("type", "project.save");
        saveObj->setProperty ("path", projectFile.getFullPathName());
        step ("project.save", api.handleMessage (juce::var (saveObj)), true);
        auto* loadObj = new juce::DynamicObject();
        loadObj->setProperty ("type", "project.load");
        loadObj->setProperty ("path", projectFile.getFullPathName());
        step ("project.load", api.handleMessage (juce::var (loadObj)), true);

        step ("transport.play", call ("{\"type\":\"transport.play\"}"), true);
        api.pumpUi (200);
        step ("transport.stop", call ("{\"type\":\"transport.stop\"}"), true);
        step ("diagnostics.click", call ("{\"type\":\"diagnostics.click\",\"token\":1}"), true);
        step ("audio.subscribe", call ("{\"type\":\"audio.subscribe\"}"), true);
        step ("session.state after", call ("{\"type\":\"session.state\"}"), true);
        step ("project.loadDemo", call ("{\"type\":\"project.loadDemo\"}"), true);
        report << "non-vst section complete\n";
        flush();

        const auto createdVst = call ("{\"type\":\"track.create\",\"name\":\"VstReg\",\"trackType\":\"midi\"}");
        step ("track.create vst", createdVst, true);
        const int vstTrackId = (int) createdVst.getProperty ("trackId", 0);
        api.tryRecaptureFactoryPreset ("bbcso_piano");
        const int index = api.getProject().indexOfTrack ((TrackId) vstTrackId);
        api.loadTrackInstrument (index, "bbcso_violin_1", false);
        api.pumpUi (200);
        step ("instrument.load violin", api.describeInstrumentState (index), true);
        step ("instrument.setTechnique", call ("{\"type\":\"instrument.setTechnique\",\"trackId\":"
                                              + juce::String (vstTrackId) + ",\"techniqueId\":\"bbcso_spiccato\"}"), true);
        step ("instrument.setTechnique long", call ("{\"type\":\"instrument.setTechnique\",\"trackId\":"
                                                   + juce::String (vstTrackId) + ",\"techniqueId\":\"bbcso_long\"}"), true);
        step ("instrument.setController", call ("{\"type\":\"instrument.setController\",\"trackId\":"
                                               + juce::String (vstTrackId) + ",\"controllerId\":\"expression\",\"value\":0.7}"), true);
        step ("instrument.setLegato", call ("{\"type\":\"instrument.setLegato\",\"trackId\":"
                                           + juce::String (vstTrackId) + ",\"legato\":true}"), true);
        step ("preview.noteOn", call ("{\"type\":\"preview.noteOn\",\"trackId\":"
                                     + juce::String (vstTrackId) + ",\"pitch\":60,\"velocity\":0.8}"), true);
        api.pumpUi (400);
        step ("preview.noteOff", call ("{\"type\":\"preview.noteOff\",\"trackId\":"
                                      + juce::String (vstTrackId) + ",\"pitch\":60}"), true);

        api.loadTrackInstrument (index, "piano_bbcso", false);
        api.pumpUi (200);
        if (const auto* track = api.getProject().getTrack (index))
        {
            const bool pianoOk = track->instrumentLoadState == InstrumentLoadState::Loaded
                                 || track->instrumentLoadState == InstrumentLoadState::Active;
            report << (pianoOk ? "PASS" : "FAIL") << "  piano factory restore  "
                   << instrumentLoadStateLabel (track->instrumentLoadState) << "  "
                   << track->instrumentLoadMessage << "\n";
            pianoOk ? ++pass : ++fail;
            if (pianoOk)
                api.playValidationPhrase (index, 80, true);
        }

        step ("instrument.unload", call ("{\"type\":\"instrument.unload\",\"trackId\":"
                                        + juce::String (vstTrackId) + "}"), true);

        const auto createdOrch = call ("{\"type\":\"track.create\",\"name\":\"M Orchestra\",\"trackType\":\"midi\"}");
        step ("m-orchestra track.create", createdOrch, true);
        const int orchTrackId = (int) createdOrch.getProperty ("trackId", 0);
        step ("plugin.insert unknown", call ("{\"type\":\"plugin.insert\",\"trackId\":"
                                            + juce::String (orchTrackId) + ",\"pluginId\":\"not_a_plugin\"}"), false);
        step ("plugin.insert orchestra_sampler", call ("{\"type\":\"plugin.insert\",\"trackId\":"
                                                      + juce::String (orchTrackId) + ",\"pluginId\":\"orchestra_sampler\"}"), true);
        step ("plugin.insert m_orchestra", call ("{\"type\":\"plugin.insert\",\"trackId\":"
                                                + juce::String (orchTrackId) + ",\"pluginId\":\"m_orchestra\"}"), true);
        const int orchIndex = api.getProject().indexOfTrack ((TrackId) orchTrackId);
        api.pumpUi (300);

        if (const auto* track = api.getProject().getTrack (orchIndex))
        {
            const bool orchOk = track->instrumentLoadState == InstrumentLoadState::Loaded
                                || track->instrumentLoadState == InstrumentLoadState::Active;
            const bool sourceOk = track->instrumentSource == ProjectSchema::sourceMOrchestra;
            report << (orchOk ? "PASS" : "FAIL") << "  m-orchestra violin load  "
                   << instrumentLoadStateLabel (track->instrumentLoadState) << "  "
                   << track->instrumentLoadMessage << "\n";
            orchOk ? ++pass : ++fail;
            report << (sourceOk ? "PASS" : "FAIL") << "  m-orchestra source field\n";
            sourceOk ? ++pass : ++fail;
        }

        step ("m-orchestra.setTechnique short", call ("{\"type\":\"instrument.setTechnique\",\"trackId\":"
                                                     + juce::String (orchTrackId) + ",\"techniqueId\":\"m_orch_short\"}"), true);
        step ("m-orchestra.setTechnique long", call ("{\"type\":\"instrument.setTechnique\",\"trackId\":"
                                                    + juce::String (orchTrackId) + ",\"techniqueId\":\"m_orch_long\"}"), true);
        step ("m-orchestra.setController", call ("{\"type\":\"instrument.setController\",\"trackId\":"
                                                + juce::String (orchTrackId) + ",\"controllerId\":\"dynamics\",\"value\":0.8}"), true);
        step ("m-orchestra.preview.noteOn", call ("{\"type\":\"preview.noteOn\",\"trackId\":"
                                                 + juce::String (orchTrackId) + ",\"pitch\":60,\"velocity\":0.85}"), true);
        api.pumpUi (250);
        step ("m-orchestra.preview.noteOff", call ("{\"type\":\"preview.noteOff\",\"trackId\":"
                                                  + juce::String (orchTrackId) + ",\"pitch\":60}"), true);

        const auto metrics = call ("{\"type\":\"diagnostics.getMetrics\"}");
        const auto mOrch = metrics.getProperty ("mOrchestra", juce::var());
        const bool metricsOk = mOrch.isObject() && (bool) mOrch.getProperty ("available", false);
        report << (metricsOk ? "PASS" : "FAIL") << "  m-orchestra diagnostics\n";
        metricsOk ? ++pass : ++fail;

        report << "\n" << pass << " PASS / " << fail << " FAIL / " << (pass + fail) << " total\n";
        flush();
        juce::Logger::writeToLog (report);
    }

private:
    std::unique_ptr<MainWindow> mainWindow;
    std::unique_ptr<EngineAPI> engineApi;
    std::unique_ptr<WebGateway> webGateway;
    std::unique_ptr<EngineHostWindow> hostWindow;
    std::unique_ptr<DawFileLogger> fileLogger;
    std::unique_ptr<HeartbeatTimer> heartbeat;
    std::unique_ptr<KeepAliveAnchor> keepAliveAnchor;
};

//==============================================================================
START_JUCE_APPLICATION (NewProjectApplication)
