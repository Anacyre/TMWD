#pragma once

#include "EngineAPI.h"
#include <array>
#include <atomic>
#include <memory>

/*  Local HTTP + WebSocket front for EngineAPI.

    Control channel is JSON text frames.
    Remote audio prototype is optional binary frames of the mixed stereo tap.
    Bound to all interfaces so LAN devices can connect; there is still no auth.
*/
class WebGateway  : private juce::Thread,
                    private juce::Timer,
                    private EngineAPI::Listener
{
public:
    explicit WebGateway (EngineAPI& engineToServe);
    ~WebGateway() override;

    bool start (int preferredPort = 17890);
    void stop();

    int getPort() const noexcept                 { return port; }
    juce::String getListenUrl() const;
    juce::String getWebSocketUrl() const;
    juce::String getAudioWebSocketUrl() const;
    juce::StringArray getListenUrls() const;
    juce::StringArray getLanAddresses() const;
    bool isListening() const noexcept            { return port > 0; }
    juce::File getWebRoot() const                { return webRoot; }
    int getNumClients() const;
    int getNumAudioClients() const;

    static constexpr int firstPort = 17890;
    static constexpr int lastPort  = 17899;

private:
    class Connection;
    class AudioPump;
    friend class Connection;
    friend class AudioPump;

    void run() override;
    void timerCallback() override;
    void onEngineChanged (int changeFlags) override;
    void postCommand (Connection* connection, juce::String jsonText);
    void broadcastText (const juce::String& jsonText);
    void pumpRemoteAudio();
    void refreshAudioTap();
    juce::File findWebRoot() const;
    juce::String makeLandingPage() const;
    juce::var makeHealth() const;

    EngineAPI& api;
    std::unique_ptr<juce::StreamingSocket> listener;
    mutable juce::CriticalSection lock;
    juce::OwnedArray<Connection> connections;
    std::unique_ptr<juce::Thread> audioPump;
    juce::File webRoot;
    std::array<char, 48> cachedSessionId {};
    std::atomic<bool> serving { false };
    std::atomic<bool> stateDirty { true };
    std::atomic<int> dirtyFlags { 0 };
    int port = 0;
    double lastClockBeats = -1.0;
    bool lastClockPlaying = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (WebGateway)
};
