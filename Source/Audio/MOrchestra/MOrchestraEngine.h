#pragma once

#include "MOrchestraModel.h"
#include <atomic>
#include <map>
#include <memory>
#include <vector>

namespace MOrchestra
{
    struct SampleBuffer
    {
        juce::AudioBuffer<float> audio;
        double sampleRate = 44100.0;
        int rootNote = 60;
        bool loop = false;
        int loopStart = 0;
        int loopEnd = 0;
        int crossfade = 0;
        juce::String key;
    };

    using SamplePtr = std::shared_ptr<const SampleBuffer>;

    struct Diagnostics
    {
        int activeVoices = 0;
        int sampleVoices = 0;
        int dspVoices = 0;
        int cacheEntries = 0;
        double cacheMb = 0.0;
        double cpuPercent = 0.0;
        bool libraryAvailable = false;
        juce::String libraryRoot;
        juce::StringArray missingInstruments;
    };

    class Instance;

    class Engine  : private juce::Thread
    {
    public:
        static Engine& get();

        void initialise();
        void shutdown();

        const LibrarySpec& getLibrary() const noexcept { return library; }
        bool isAvailable() const noexcept { return available.load(); }
        const InstrumentSpec* findInstrument (const juce::String& id) const;

        SamplePtr findCached (const juce::String& key) const;
        SamplePtr requestSample (const SampleRef& ref, bool waitIfNeeded);
        const SampleRef* pickSample (const InstrumentSpec& spec, Articulation artic,
                                     int midiNote, int velocity, int dynamics, int rrIndex = 0) const;
        const SampleRef* pickLayer (const InstrumentSpec& spec, Articulation artic,
                                    int midiNote, int velocity, int dynamics,
                                    int excludeLayer, int rrIndex = 0) const;
        const SampleRef* pickNeighbor (const InstrumentSpec& spec, Articulation artic,
                                       int midiNote, int velocity, int dynamics,
                                       int excludeRoot, int rrIndex = 0) const;
        void prefetchAround (const InstrumentSpec& spec, Articulation artic,
                             int midiNote, int velocity, int dynamics);
        juce::String sampleKey (const SampleRef& ref) const;

        void registerInstance (Instance* instance);
        void unregisterInstance (Instance* instance);
        void notifyVoiceStarted();
        void notifyVoiceEnded();
        bool shouldSteal() const;
        void stealQuietest();

        Diagnostics getDiagnostics() const;
        void addCallbackTime (double seconds);

        juce::int64 cacheBytes() const;

    private:
        Engine();
        ~Engine() override;

        void run() override;
        SamplePtr decode (const SampleRef& ref);
        void insertCache (SamplePtr buffer);
        void evictIfNeeded (size_t extraBytes);
        void findLoopPoints (SampleBuffer& buffer) const;
        const SampleRef* pickRanked (const InstrumentSpec& spec, Articulation artic,
                                     int midiNote, int velocity, int dynamics, int rrIndex,
                                     int excludeLayer, int excludeRoot) const;

        LibrarySpec library;
        juce::File root;
        juce::AudioFormatManager formats;
        std::map<juce::String, std::unique_ptr<juce::ZipFile>> zips;

        mutable juce::CriticalSection cacheLock;
        std::map<juce::String, SamplePtr> cache;
        std::vector<juce::String> lru;
        juce::int64 cacheByteCount = 0;

        juce::CriticalSection jobLock;
        std::vector<SampleRef> jobs;
        juce::WaitableEvent jobEvent;
        juce::WaitableEvent decodedEvent;

        juce::CriticalSection instanceLock;
        std::vector<Instance*> instances;

        std::atomic<bool> available { false };
        std::atomic<int> activeVoices { 0 };
        std::atomic<double> cpuSeconds { 0.0 };
        std::atomic<double> cpuWindowStart { 0.0 };
        std::atomic<bool> running { false };

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Engine)
    };
}
