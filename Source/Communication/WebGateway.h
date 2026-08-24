#pragma once

#include "EngineAPI.h"

/*  Local HTTP + WebSocket front for EngineAPI.

    Bound to 127.0.0.1 only.  The Vue H5 client talks JSON through handleMessage();
    this class is the socket layer that was left as a comment on EngineAPI.
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
    bool isListening() const noexcept            { return port > 0; }
    juce::File getWebRoot() const                { return webRoot; }
    int getNumClients() const;

    static constexpr int firstPort = 17890;
    static constexpr int lastPort  = 17899;

private:
    class Connection;
    friend class Connection;

    void run() override;
    void timerCallback() override;
    void onEngineChanged (int changeFlags) override;
    void postCommand (Connection* connection, juce::String jsonText);
    void broadcastText (const juce::String& jsonText);
    juce::File findWebRoot() const;
    juce::String makeLandingPage() const;

    EngineAPI& api;
    juce::StreamingSocket listener;
    mutable juce::CriticalSection lock;
    juce::OwnedArray<Connection> connections;
    juce::File webRoot;
    std::atomic<bool> serving { false };
    std::atomic<bool> stateDirty { true };
    int port = 0;
    double lastClockBeats = -1.0;
    bool lastClockPlaying = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (WebGateway)
};
