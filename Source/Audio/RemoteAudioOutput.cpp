#include "RemoteAudioOutput.h"

namespace
{
    constexpr int headerBytes = 40;

    void writeU16 (char*& p, juce::uint16 v) noexcept
    {
        p[0] = (char) (v);
        p[1] = (char) (v >> 8);
        p += 2;
    }

    void writeU32 (char*& p, juce::uint32 v) noexcept
    {
        p[0] = (char) (v);
        p[1] = (char) (v >> 8);
        p[2] = (char) (v >> 16);
        p[3] = (char) (v >> 24);
        p += 4;
    }

    void writeU64 (char*& p, juce::uint64 v) noexcept
    {
        writeU32 (p, (juce::uint32) v);
        writeU32 (p, (juce::uint32) (v >> 32));
    }

    juce::uint64 hostMicros() noexcept
    {
        return (juce::uint64) (juce::Time::getMillisecondCounterHiRes() * 1000.0);
    }
}

RemoteAudioOutput::RemoteAudioOutput()
    : storage ((size_t) ringFrames * (size_t) channels, 0.0f)
{
}

void RemoteAudioOutput::prepare (double newSampleRate, int newBlockSize)
{
    sampleRate.store (newSampleRate > 0.0 ? newSampleRate : 44100.0);
    blockSize.store (juce::jmax (16, newBlockSize));
    fifo.reset();
}

void RemoteAudioOutput::requestClick (juce::uint64 token) noexcept
{
    pendingClick.store (token == 0 ? 1 : token);
}

void RemoteAudioOutput::resetCounters() noexcept
{
    underruns.store (0);
    overflows.store (0);
    sequence.store (0);
    fifo.reset();
}

int RemoteAudioOutput::getAvailableFrames() const
{
    return fifo.getNumReady();
}

int RemoteAudioOutput::getBufferDepthMs() const
{
    const auto sr = sampleRate.load();
    if (sr <= 0.0)
        return 0;

    return juce::roundToInt (1000.0 * (double) getAvailableFrames() / sr);
}

void RemoteAudioOutput::pushPreMaster (const juce::AudioBuffer<float>& master, int numSamples)
{
    if (! enabled.load() || numSamples <= 0)
        return;

    const auto srcChannels = master.getNumChannels();
    if (srcChannels <= 0)
        return;

    if (fifo.getFreeSpace() < numSamples)
    {
        overflows.fetch_add (1);
        return;
    }

    const auto clickToken = pendingClick.exchange (0);
    const auto scope = fifo.write (numSamples);
    int sourceIndex = 0;

    auto writeInterleaved = [&] (int start, int count)
    {
        for (int i = 0; i < count; ++i, ++sourceIndex)
        {
            const auto left = master.getSample (0, sourceIndex);
            const auto right = srcChannels > 1 ? master.getSample (1, sourceIndex) : left;
            const auto offset = (size_t) (start + i) * (size_t) channels;
            storage[offset] = left;
            storage[offset + 1] = right;
        }
    };

    writeInterleaved (scope.startIndex1, scope.blockSize1);
    writeInterleaved (scope.startIndex2, scope.blockSize2);

    if (clickToken != 0 && scope.blockSize1 + scope.blockSize2 > 0)
    {
        const auto frame = scope.blockSize1 > 0 ? scope.startIndex1 : scope.startIndex2;
        const auto offset = (size_t) frame * (size_t) channels;
        storage[offset] = 0.95f;
        storage[offset + 1] = 0.95f;
        injectedClick.store (clickToken);
    }
}

void RemoteAudioOutput::pushMaster (const juce::AudioBuffer<float>& master, int numSamples)
{
    pushPreMaster (master, numSamples);
}

void RemoteAudioOutput::writeHeader (char* dest, juce::uint32 flags, juce::uint32 frameCount,
                                     juce::uint64 hostTime, juce::uint64 clickToken) const noexcept
{
    auto* p = dest;
    writeU32 (p, magic);
    writeU16 (p, packetVersion);
    writeU16 (p, (juce::uint16) channels);
    writeU32 (p, sequence.load());
    writeU32 (p, flags);
    writeU32 (p, (juce::uint32) juce::roundToInt (sampleRate.load()));
    writeU32 (p, frameCount);
    writeU64 (p, hostTime);
    writeU64 (p, clickToken);
}

bool RemoteAudioOutput::pullPacket (juce::MemoryBlock& dest, int maxFrames)
{
    const auto available = fifo.getNumReady();

    if (available <= 0)
        return false;

    const auto frames = juce::jmin (maxFrames, available, 512);
    const auto clickToken = injectedClick.exchange (0);
    auto flags = 0u;

    if (clickToken != 0)
        flags |= flagClick;

    dest.setSize ((size_t) headerBytes + (size_t) frames * (size_t) channels * sizeof (float), false);
    writeHeader (static_cast<char*> (dest.getData()), flags, (juce::uint32) frames,
                 hostMicros(), clickToken);

    auto* samples = reinterpret_cast<float*> (static_cast<char*> (dest.getData()) + headerBytes);
    const auto scope = fifo.read (frames);
    int written = 0;

    auto copyFrames = [&] (int start, int count)
    {
        for (int i = 0; i < count; ++i)
        {
            const auto offset = (size_t) (start + i) * (size_t) channels;
            samples[written * channels] = storage[offset];
            samples[written * channels + 1] = storage[offset + 1];
            ++written;
        }
    };

    copyFrames (scope.startIndex1, scope.blockSize1);
    copyFrames (scope.startIndex2, scope.blockSize2);

    sequence.fetch_add (1);
    return true;
}

juce::var RemoteAudioOutput::describeStatus() const
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("stereo", true);
    object->setProperty ("channels", channels);
    const auto sr = sampleRate.load();
    const auto frames = juce::jlimit (0, ringFrames, getAvailableFrames());
    object->setProperty ("sampleRate", sr > 1000.0 ? sr : 44100.0);
    object->setProperty ("blockSize", juce::jmax (0, blockSize.load()));
    object->setProperty ("enabled", enabled.load());
    object->setProperty ("sequence", (int) sequence.load());
    object->setProperty ("underruns", (int) underruns.load());
    object->setProperty ("overflows", (int) overflows.load());
    object->setProperty ("availableFrames", frames);
    object->setProperty ("bufferDepthMs", getBufferDepthMs());
    object->setProperty ("transport", "websocket-binary-pcm-v1");
    object->setProperty ("transportIsPrototype", true);
    return juce::var (object);
}
