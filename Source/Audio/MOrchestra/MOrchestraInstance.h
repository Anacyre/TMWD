#pragma once

#include "../../Plugins/PluginInstance.h"
#include "MOrchestraEngine.h"

namespace MOrchestra
{
    class Instance  : public PluginInstance
    {
    public:
        explicit Instance (const juce::String& definitionId);
        ~Instance() override;

        juce::String getInstrumentId() const override;
        juce::String getDisplayName() const override;
        juce::String getInstrumentDefinitionId() const override { return definitionId; }
        void setInstrumentDefinitionId (const juce::String& id) override;
        void setDefinitionId (const juce::String& id) { setInstrumentDefinitionId (id); }

        void prepare (double sampleRate, int maximumBlockSize) override;
        void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;
        void reset() override;

        bool applyProgram (const juce::String& name) override;
        bool setParameterByName (const juce::String& name, float value) override;

        void stealQuietestVoice();
        int countActiveVoices() const;

    private:
        struct Source
        {
            SamplePtr sample;
            double pos = 0.0;
            double ratio = 1.0;
            double delaySamples = 0.0;
            float panL = 0.707f;
            float panR = 0.707f;
            float cutoff = 8000.0f;
            float lpL = 0.0f;
            float lpR = 0.0f;
            float cents = 0.0f;
            float velOffset = 0.0f;
            int role = 0;
            int dynLayer = 64;
        };

        struct Voice
        {
            bool active = false;
            bool releasing = false;
            bool pending = false;
            bool startedNotify = false;
            bool dualLayer = false;
            bool hasPrimary = false;
            bool hasLayer = false;
            bool hasNeighbor = false;
            int midiNote = 60;
            int id = 0;
            int velocityMidi = 100;
            int dynLayerA = 64;
            int dynLayerB = 64;
            float velocity = 0.8f;
            float env = 0.0f;
            float envTarget = 0.0f;
            float age = 0.0f;
            float vibratoPhase = 0.0f;
            float vibratoRate = 5.1f;
            float noiseLp = 0.0f;
            uint32_t seed = 0;
            int sourceCount = 0;
            Source sources[4];
            SampleRef primaryRef;
            SampleRef layerRef;
            SampleRef neighborRef;
        };

        void noteOn (int note, float velocity);
        void noteOff (int note);
        void allOff (bool immediate);
        void handleMidi (const juce::MidiMessage& message);
        void renderVoice (Voice& voice, juce::AudioBuffer<float>& buffer, int numSamples);
        void tryFillSources (Voice& voice);
        void addSource (Voice& voice, const SampleRef& ref, SamplePtr sample, int role, int index, int count);
        uint32_t makeSeed (int note, int voiceIndex) const;
        Articulation currentArtic() const;
        const InstrumentSpec* spec() const;
        void applyPendingDefinition();

        juce::String definitionId;
        juce::String pendingDefinitionId;
        juce::SpinLock idLock;
        std::atomic<bool> pendingApply { false };
        Articulation articulation = Articulation::longArt;
        std::atomic<float> cc1 { 100.0f / 127.0f };
        std::atomic<float> cc11 { 100.0f / 127.0f };
        std::atomic<float> vibratoAmt { 0.35f };
        double sampleRate = 44100.0;
        int nextVoiceId = 1;
        static constexpr int maxLocalVoices = 32;
        Voice voices[maxLocalVoices];
    };
}
