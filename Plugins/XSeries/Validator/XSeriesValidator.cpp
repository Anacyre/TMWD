/** Minimal VST3 host used to validate the installed TMSS X Series bundles.

    Usage:  XSeriesValidator [<directory containing .vst3 bundles>]

    For each bundle found it checks that the plugin scans, instantiates, reports sane bus
    layouts, survives prepare/process at several sample rates and block sizes without
    producing NaN or Inf, reports a plausible latency, round-trips its state, and can open
    and close an editor. Exit code is 0 only if every check passes.
*/

#include <JuceHeader.h>

namespace
{
    int failures = 0;
    int checks = 0;

    void check (bool condition, const juce::String& description)
    {
        ++checks;
        if (! condition)
            ++failures;
        std::cout << (condition ? "  ok    " : "  FAIL  ") << description << std::endl;
    }

    bool bufferIsFinite (const juce::AudioBuffer<float>& buffer)
    {
        for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        {
            const float* data = buffer.getReadPointer (channel);
            for (int i = 0; i < buffer.getNumSamples(); ++i)
                if (! std::isfinite (data[i]))
                    return false;
        }
        return true;
    }

    void fillTestSignal (juce::AudioBuffer<float>& buffer, double sampleRate, int mode)
    {
        const int numSamples = buffer.getNumSamples();
        for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        {
            float* data = buffer.getWritePointer (channel);
            for (int i = 0; i < numSamples; ++i)
            {
                const double t = static_cast<double> (i) / sampleRate;
                switch (mode)
                {
                    case 0: data[i] = 0.0f; break;                                       // silence
                    case 1: data[i] = static_cast<float> (0.5 * std::sin (6.2831853 * 1000.0 * t)); break;
                    case 2: data[i] = (i == numSamples / 2) ? 1.6f : 0.0f; break;        // hot transient
                    case 3: data[i] = 1.9f * (juce::Random::getSystemRandom().nextFloat() * 2.0f - 1.0f); break;
                    default: data[i] = 0.0f; break;
                }
            }
        }
    }

    void exerciseParameters (juce::AudioPluginInstance& plugin, juce::AudioBuffer<float>& buffer,
                             juce::MidiBuffer& midi, const juce::String& name)
    {
        // Every parameter is swept to both extremes and back while audio flows, which is where
        // uninitialised coefficient state and division by zero show up.
        bool finite = true;
        for (auto* parameter : plugin.getParameters())
        {
            const float original = parameter->getValue();
            for (const float value : { 0.0f, 1.0f, 0.5f, original })
            {
                parameter->setValueNotifyingHost (value);
                fillTestSignal (buffer, 48000.0, 1);
                plugin.processBlock (buffer, midi);
                finite = finite && bufferIsFinite (buffer);
            }
        }
        check (finite, name + ": stays finite across every parameter extreme");
    }

    bool validate (juce::AudioPluginFormatManager& formats, const juce::PluginDescription& description)
    {
        const auto name = description.name;
        std::cout << "\n" << name << " (" << description.pluginFormatName << ", "
                  << description.version << ")" << std::endl;

        const int before = failures;

        juce::String error;
        std::unique_ptr<juce::AudioPluginInstance> plugin (
            formats.createPluginInstance (description, 48000.0, 512, error));

        check (plugin != nullptr, name + ": instantiates" + (plugin == nullptr ? " (" + error + ")" : ""));
        if (plugin == nullptr)
            return false;

        check (plugin->getTotalNumInputChannels() == 2 && plugin->getTotalNumOutputChannels() == 2,
               name + ": reports a stereo in / stereo out layout");
        check (plugin->getParameters().size() > 0, name + ": exposes parameters");
        check (plugin->acceptsMidi() == false, name + ": is an audio effect, not a MIDI effect");

        juce::MidiBuffer midi;

        for (const double sampleRate : { 44100.0, 48000.0, 96000.0, 192000.0 })
        {
            for (const int blockSize : { 16, 128, 512, 2048 })
            {
                plugin->setRateAndBufferSizeDetails (sampleRate, blockSize);
                plugin->prepareToPlay (sampleRate, blockSize);

                juce::AudioBuffer<float> buffer (2, blockSize);
                bool finite = true;
                bool silentIntoSilent = true;

                for (int mode = 0; mode < 4; ++mode)
                {
                    for (int block = 0; block < 8; ++block)
                    {
                        fillTestSignal (buffer, sampleRate, mode);
                        plugin->processBlock (buffer, midi);
                        finite = finite && bufferIsFinite (buffer);
                        if (mode == 0 && block > 3)
                            silentIntoSilent = silentIntoSilent && buffer.getMagnitude (0, blockSize) < 1.0e-4f;
                    }
                }

                const auto label = name + ": " + juce::String (sampleRate / 1000.0, 1) + " kHz / "
                                 + juce::String (blockSize) + " samples";
                check (finite, label + " produces finite output");
                check (silentIntoSilent, label + " is silent on silence");

                const int latency = plugin->getLatencySamples();
                check (latency >= 0 && latency < static_cast<int> (sampleRate),
                       label + " reports a plausible latency (" + juce::String (latency) + ")");

                plugin->reset();
                plugin->releaseResources();
            }
        }

        plugin->prepareToPlay (48000.0, 512);
        juce::AudioBuffer<float> buffer (2, 512);
        exerciseParameters (*plugin, buffer, midi, name);

        // State round-trip.
        juce::MemoryBlock stateA, stateB;
        plugin->getStateInformation (stateA);
        for (auto* parameter : plugin->getParameters())
            parameter->setValueNotifyingHost (parameter->getValue() > 0.5f ? 0.1f : 0.9f);
        plugin->setStateInformation (stateA.getData(), static_cast<int> (stateA.getSize()));
        plugin->getStateInformation (stateB);
        check (stateA == stateB, name + ": state round-trips unchanged");

        check (plugin->hasEditor(), name + ": provides an editor");
        if (plugin->hasEditor())
        {
            std::unique_ptr<juce::AudioProcessorEditor> editor (plugin->createEditorIfNeeded());
            check (editor != nullptr, name + ": editor is created");
            if (editor != nullptr)
            {
                check (editor->getWidth() > 200 && editor->getHeight() > 150,
                       name + ": editor has a usable default size ("
                           + juce::String (editor->getWidth()) + " x "
                           + juce::String (editor->getHeight()) + ")");

                // Render into an image to catch paint-time assertions and bad geometry.
                juce::Image image (juce::Image::ARGB, editor->getWidth(), editor->getHeight(), true);
                juce::Graphics g (image);
                editor->paintEntireComponent (g, true);
                check (true, name + ": editor paints without crashing");

                editor->setSize (editor->getWidth() * 3 / 4, editor->getHeight() * 3 / 4);
                editor->setSize (editor->getWidth() * 2, editor->getHeight() * 2);
                check (true, name + ": editor survives resizing");

                plugin->editorBeingDeleted (editor.get());
            }
        }

        plugin->releaseResources();
        return failures == before;
    }
}

int main (int argc, char* argv[])
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    juce::File searchDirectory (argc > 1
        ? juce::String (argv[1])
        : juce::String ("C:/Program Files/Common Files/VST3/TMSS X series"));

    std::cout << "TMSS X Series validator" << std::endl;
    std::cout << "Scanning " << searchDirectory.getFullPathName() << std::endl;

    if (! searchDirectory.isDirectory())
    {
        std::cout << "  FAIL  search directory does not exist" << std::endl;
        return 1;
    }

    // Only VST3 is registered: the other formats would just add scan noise here.
    juce::AudioPluginFormatManager formats;
    formats.addFormat (new juce::VST3PluginFormat());

    juce::KnownPluginList list;
    juce::OwnedArray<juce::PluginDescription> found;

    for (auto* format : formats.getFormats())
    {
        if (format->getName() != "VST3")
            continue;

        juce::PluginDirectoryScanner scanner (list, *format,
                                              juce::FileSearchPath (searchDirectory.getFullPathName()),
                                              true, juce::File(), false);
        juce::String pluginBeingScanned;
        while (scanner.scanNextFile (true, pluginBeingScanned))
        {
        }

        for (const auto& description : scanner.getFailedFiles())
            std::cout << "  FAIL  could not scan " << description << std::endl;

        if (! scanner.getFailedFiles().isEmpty())
            ++failures;
    }

    const auto types = list.getTypes();
    std::cout << "Found " << types.size() << " plugin(s)" << std::endl;

    if (types.isEmpty())
    {
        std::cout << "  FAIL  no plugins found" << std::endl;
        return 1;
    }

    for (const auto& description : types)
        validate (formats, description);

    std::cout << "\n" << (failures == 0 ? "PASS" : "FAIL") << " — "
              << (checks - failures) << " / " << checks << " checks passed" << std::endl;

    return failures == 0 ? 0 : 1;
}
