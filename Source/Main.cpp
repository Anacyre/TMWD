/*
  ==============================================================================

    This file contains the basic startup code for a JUCE application.

  ==============================================================================
*/

#include <JuceHeader.h>
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

        if (commandLine.containsIgnoreCase ("--probe-vst3"))
        {
            runVst3Probe (logDir.getChildFile ("phase4-probe.txt"));
            quit();
            return;
        }

        if (commandLine.containsIgnoreCase ("--dump-state"))
        {
            runStateDump (logDir.getChildFile ("phase4-state-dump.txt"));
            quit();
            return;
        }

        if (commandLine.containsIgnoreCase ("--audio-test"))
        {
            runAudioTest (logDir.getChildFile ("phase45-audio-test.txt"));
            quit();
            return;
        }

        if (commandLine.containsIgnoreCase ("--native"))
        {
            mainWindow.reset (new MainWindow (getApplicationName()));
            return;
        }

        if (commandLine.containsIgnoreCase ("--web-only"))
        {
            startWebHost();
            return;
        }

        startSharedHost();
    }

    void shutdown() override
    {
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
        quit();
    }

    void anotherInstanceStarted (const juce::String&) override {}

    //==============================================================================
    class MainWindow    : public juce::DocumentWindow
    {
    public:
        MainWindow (juce::String name, EngineAPI* sharedEngine = nullptr)
            : DocumentWindow (name, juce::Colour (0xff121212), DocumentWindow::allButtons)
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
            JUCEApplication::getInstance()->systemRequestedQuit();
        }

    private:
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
            centreWithSize (640, 320);
            addToDesktop (getDesktopWindowStyleFlags());
            useSoftwareRenderer (*this);
            setVisible (true);
        }

        void closeButtonPressed() override
        {
            JUCEApplication::getInstance()->systemRequestedQuit();
        }

    private:
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EngineHostWindow)
    };

    void startWebHost()
    {
        engineApi = std::make_unique<EngineAPI>();
        webGateway = std::make_unique<WebGateway> (*engineApi);
        hostWindow.reset (new EngineHostWindow (*engineApi, *webGateway));
        juce::MessageManager::callAsync ([this] { finishEngineServices (true, true); });
    }

    void startSharedHost()
    {
        engineApi = std::make_unique<EngineAPI>();
        webGateway = std::make_unique<WebGateway> (*engineApi);
        mainWindow.reset (new MainWindow (getApplicationName(), engineApi.get()));
        juce::MessageManager::callAsync ([this] { finishEngineServices (true, false); });
    }

    void finishEngineServices (bool openBrowser, bool starterContent)
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

        if (openBrowser && ! juce::Process::isRunningUnderDebugger())
            juce::Timer::callAfterDelay (250, [url] { juce::URL (url).launchInDefaultBrowser(); });
        else
            juce::Logger::writeToLog ("UI available at " + url
                                      + (juce::Process::isRunningUnderDebugger()
                                             ? " (browser not auto-opened under debugger)"
                                             : ""));
    }

    void runStateDump (const juce::File& reportFile)
    {
        EngineAPI api;
        juce::String report;
        report << "Phase 4 state dump\n";
        report << "Audio: " << api.initialise() << "\n";
        report << api.getInstruments().getStartupStatus() << "\n";
        report << api.dumpDefaultPluginStates() << "\n";
        reportFile.replaceWithText (report);
        juce::Logger::writeToLog (report);
    }

    void runAudioTest (const juce::File& reportFile)
    {
        EngineAPI api;
        juce::String report;
        const auto flush = [&]
        {
            reportFile.replaceWithText (report);
        };

        report << "Phase 4.5 audio / state validation\n";
        report << "Audio: " << api.initialise() << "\n";
        report << api.getInstruments().getStartupStatus() << "\n";
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
            api.unloadTrackInstrument (index);
            api.loadTrackInstrument (index, definitionId, false);

            if (const auto* track = api.getProject().getTrack (index))
            {
                report << instrumentLoadStateLabel (track->instrumentLoadState) << "\n"
                       << track->instrumentLoadMessage << "\n"
                       << "preset=" << track->presetId << "\n";

                if (track->instrumentLoadState == InstrumentLoadState::Loaded
                    || track->instrumentLoadState == InstrumentLoadState::Active)
                {
                    api.playValidationPhrase (index, 80, true);

                    if (auto* instance = api.getEngine().getTrackInstrument (index))
                        report << "plugin=" << instance->getDisplayName()
                               << " version=" << instance->getPluginVersion() << "\n";
                }
            }

            flush();
        }

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
            const auto loadError = api.loadProjectFromFile (projectFile);
            juce::Thread::sleep (2500);

            if (loadError.isNotEmpty())
                report << "load error: " << loadError << "\n";
            else
                for (int i = 1; i < api.getProject().getNumTracks(); ++i)
                    if (const auto* track = api.getProject().getTrack (i))
                        report << track->name << "  "
                               << instrumentLoadStateLabel (track->instrumentLoadState) << "  "
                               << track->instrumentLoadMessage << "  preset=" << track->presetId << "\n";
        }
        else
        {
            report << "save failed\n";
        }

        reportFile.replaceWithText (report);
        juce::Logger::writeToLog (report);
    }

    void runVst3Probe (const juce::File& reportFile)
    {
        EngineAPI api;
        juce::String report;
        report << "Phase 4 VST3 probe\n";
        report << "Audio: " << api.initialise() << "\n";
        report << api.getInstruments().getStartupStatus() << "\n";
        report << api.getEngine().getPluginHost().inspectApprovedPlugins() << "\n";

        for (const auto& warning : api.getInstruments().getResourceWarnings())
            report << "Warning: " << warning << "\n";

        const int index = api.getProject().addTrack (TrackType::Midi, "Probe", juce::Colour (0xff4a90d9));
        const char* sequence[] = { "bbcso_violin_1", "piano_bbcso", "soft_imperial",
                                   "celestial_strings", "small_percussion", "angelic_choir" };

        for (const auto* definitionId : sequence)
        {
            report << "\n--- load " << definitionId << " ---\n";
            api.unloadTrackInstrument (index);
            api.loadTrackInstrument (index, definitionId, false);

            if (const auto* track = api.getProject().getTrack (index))
            {
                report << instrumentLoadStateLabel (track->instrumentLoadState) << "\n"
                       << track->instrumentLoadMessage << "\n";

                if (auto* instance = api.getEngine().getTrackInstrument (index))
                    report << instance->getIntrospectionSummary() << "\n";
            }

            api.unloadTrackInstrument (index);
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

private:
    std::unique_ptr<MainWindow> mainWindow;
    std::unique_ptr<EngineAPI> engineApi;
    std::unique_ptr<WebGateway> webGateway;
    std::unique_ptr<EngineHostWindow> hostWindow;
    std::unique_ptr<DawFileLogger> fileLogger;
};

//==============================================================================
START_JUCE_APPLICATION (NewProjectApplication)
