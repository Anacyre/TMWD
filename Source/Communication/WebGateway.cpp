#include "WebGateway.h"
#include "../Model/ProjectSchema.h"
#include <cmath>
#include <cstring>

namespace
{
    constexpr int maxHttpBytes = 64 * 1024;
    constexpr int maxFrameBytes = 1024 * 1024;

    juce::String jsonLine (const juce::var& value)
    {
        return juce::JSON::toString (value, true);
    }

    juce::uint32 rol (juce::uint32 v, int n) noexcept
    {
        return (v << n) | (v >> (32 - n));
    }

    void sha1Block (juce::uint32 h[5], const juce::uint8* p)
    {
        juce::uint32 w[80];

        for (int i = 0; i < 16; ++i)
            w[(size_t) i] = (juce::uint32) ((p[i * 4] << 24) | (p[i * 4 + 1] << 16)
                                            | (p[i * 4 + 2] << 8) | p[i * 4 + 3]);

        for (int i = 16; i < 80; ++i)
            w[(size_t) i] = rol (w[(size_t) (i - 3)] ^ w[(size_t) (i - 8)]
                                 ^ w[(size_t) (i - 14)] ^ w[(size_t) (i - 16)], 1);

        auto a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];

        for (int i = 0; i < 80; ++i)
        {
            juce::uint32 f, k;

            if (i < 20)      { f = (b & c) | ((~b) & d);            k = 0x5A827999; }
            else if (i < 40) { f = b ^ c ^ d;                       k = 0x6ED9EBA1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d);     k = 0x8F1BBCDC; }
            else             { f = b ^ c ^ d;                       k = 0xCA62C1D6; }

            const auto temp = rol (a, 5) + f + e + k + w[(size_t) i];
            e = d;
            d = c;
            c = rol (b, 30);
            b = a;
            a = temp;
        }

        h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
    }

    void sha1 (const void* data, size_t n, juce::uint8 out[20])
    {
        juce::uint32 h[5] { 0x67452301u, 0xEFCDAB89u, 0x98BADCFEu, 0x10325476u, 0xC3D2E1F0u };
        auto* bytes = static_cast<const juce::uint8*> (data);
        juce::uint8 block[64];
        size_t offset = 0;

        for (; offset + 64 <= n; offset += 64)
            sha1Block (h, bytes + offset);

        const auto rem = n - offset;
        std::memcpy (block, bytes + offset, rem);
        block[rem] = 0x80;

        if (rem + 1 + 8 <= 64)
        {
            std::memset (block + rem + 1, 0, 56 - rem);
        }
        else
        {
            std::memset (block + rem + 1, 0, 64 - rem - 1);
            sha1Block (h, block);
            std::memset (block, 0, 56);
        }

        const auto bits = (juce::uint64) n * 8ull;

        for (int b = 0; b < 8; ++b)
            block[56 + b] = (juce::uint8) (bits >> (56 - b * 8));

        sha1Block (h, block);

        for (int k = 0; k < 5; ++k)
        {
            out[k * 4]     = (juce::uint8) (h[k] >> 24);
            out[k * 4 + 1] = (juce::uint8) (h[k] >> 16);
            out[k * 4 + 2] = (juce::uint8) (h[k] >> 8);
            out[k * 4 + 3] = (juce::uint8)  h[k];
        }
    }

    juce::String websocketAccept (const juce::String& key)
    {
        const auto src = key.trim() + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        const auto utf8 = src.toRawUTF8();
        juce::uint8 digest[20];
        sha1 (utf8, std::strlen (utf8), digest);
        return juce::Base64::toBase64 (digest, 20);
    }

    juce::String mimeFor (const juce::File& file)
    {
        const auto ext = file.getFileExtension().toLowerCase();

        if (ext == ".html" || ext == ".htm") return "text/html; charset=utf-8";
        if (ext == ".js")   return "application/javascript; charset=utf-8";
        if (ext == ".css")  return "text/css; charset=utf-8";
        if (ext == ".json") return "application/json; charset=utf-8";
        if (ext == ".svg")  return "image/svg+xml";
        if (ext == ".png")  return "image/png";
        if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
        if (ext == ".ico")  return "image/x-icon";
        if (ext == ".woff") return "font/woff";
        if (ext == ".woff2") return "font/woff2";
        if (ext == ".wasm") return "application/wasm";
        return "application/octet-stream";
    }

    juce::StringArray parseHeaderLines (const juce::String& request)
    {
        return juce::StringArray::fromLines (request.replace ("\r\n", "\n"));
    }

    juce::String headerValue (const juce::StringArray& lines, const juce::String& name)
    {
        for (int i = 1; i < lines.size(); ++i)
        {
            const auto line = lines[i];
            const auto colon = line.indexOfChar (':');

            if (colon > 0 && line.substring (0, colon).trim().equalsIgnoreCase (name))
                return line.substring (colon + 1).trim();
        }

        return {};
    }

    juce::String decodePath (juce::String path)
    {
        const auto query = path.indexOfChar ('?');

        if (query >= 0)
            path = path.substring (0, query);

        return juce::URL::removeEscapeChars (path);
    }
}

//==============================================================================
class WebGateway::Connection  : public juce::Thread
{
public:
    Connection (WebGateway& ownerToUse, std::unique_ptr<juce::StreamingSocket> socketToUse)
        : juce::Thread ("DawWeb-WS"),
          owner (ownerToUse),
          socket (std::move (socketToUse))
    {
    }

    ~Connection() override
    {
        closeSocket();
        stopThread (2000);
    }

    void closeSocket()
    {
        const juce::ScopedLock sl (writeLock);

        if (socket != nullptr)
            socket->close();
    }

    bool sendText (const juce::String& text)
    {
        if (! websocket.load() || audioChannel.load())
            return false;

        const juce::ScopedLock sl (outLock);
        outbound.add (text);
        return true;
    }

    bool sendBinary (const void* data, int size)
    {
        if (! websocket.load() || ! audioChannel.load() || data == nullptr || size <= 0)
            return false;

        return sendFrame (2, data, size);
    }

    void setAudioSubscribed (bool shouldSubscribe) noexcept { audioSubscribed.store (shouldSubscribe); }
    void setAudioChannel (bool isAudio) noexcept
    {
        audioChannel.store (isAudio);

        if (isAudio)
            audioSubscribed.store (true);
    }
    bool wantsAudio() const noexcept { return audioSubscribed.load(); }
    bool isAudioChannel() const noexcept { return audioChannel.load(); }
    bool isWebSocket() const noexcept { return websocket.load(); }

    void run() override
    {
        juce::MemoryBlock buffer;
        juce::String request;

        while (! threadShouldExit())
        {
            juce::uint8 chunk[1024];
            const auto n = readSome (chunk, (int) sizeof (chunk), 1000);

            if (n < 0)
                break;

            if (n == 0)
                continue;

            buffer.append (chunk, (size_t) n);
            request = juce::String::fromUTF8 (static_cast<const char*> (buffer.getData()),
                                              (int) buffer.getSize());

            if (request.contains ("\r\n\r\n") || request.contains ("\n\n"))
                break;

            if ((int) buffer.getSize() > maxHttpBytes)
                return;
        }

        if (threadShouldExit() || request.isEmpty()
            || (! request.contains ("\r\n\r\n") && ! request.contains ("\n\n")))
            return;

        const auto headerEnd = request.indexOf ("\r\n\r\n") >= 0 ? request.indexOf ("\r\n\r\n") + 4
                                                                 : request.indexOf ("\n\n") + 2;
        const auto headerText = request.substring (0, headerEnd);
        const auto lines = parseHeaderLines (headerText);
        const auto requestLine = lines.isEmpty() ? juce::String() : lines[0];
        const auto parts = juce::StringArray::fromTokens (requestLine, " ", "");
        const auto method = parts.size() > 0 ? parts[0] : juce::String();
        const auto path = decodePath (parts.size() > 1 ? parts[1] : "/");
        const auto upgrade = headerValue (lines, "Upgrade");
        const auto connectionHeader = headerValue (lines, "Connection");

        if (method == "GET"
            && upgrade.containsIgnoreCase ("websocket")
            && connectionHeader.containsIgnoreCase ("upgrade"))
        {
            const auto key = headerValue (lines, "Sec-WebSocket-Key");

            if (key.isEmpty() || ! handshake (key))
                return;

            websocket.store (true);

            if (path == "/audio" || path == "/ws/audio")
                setAudioChannel (true);

            serveWebSocket (buffer, headerEnd);
            return;
        }

        handleHttp (method, path);
    }

private:
    int readSome (void* dest, int bytes, int timeoutMs)
    {
        if (socket == nullptr)
            return -1;

        const auto ready = socket->waitUntilReady (true, timeoutMs);

        if (ready < 0)
            return -1;

        if (ready == 0)
            return 0;

        return socket->read (dest, bytes, false);
    }

    bool writeAll (const void* data, int bytes)
    {
        const juce::ScopedLock sl (writeLock);

        if (socket == nullptr)
            return false;

        auto* p = static_cast<const char*> (data);
        int left = bytes;

        while (left > 0)
        {
            const auto ready = socket->waitUntilReady (false, 2000);

            if (ready <= 0)
                return false;

            const auto n = socket->write (p, left);

            if (n < 0)
                return false;

            p += n;
            left -= n;
        }

        return true;
    }

    bool handshake (const juce::String& key)
    {
        const auto accept = websocketAccept (key);
        const auto response =
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Accept: " + accept + "\r\n"
            "\r\n";
        const auto utf8 = response.toRawUTF8();
        return writeAll (utf8, (int) std::strlen (utf8));
    }

    void sendHttp (int status, const juce::String& reason, const juce::String& contentType,
                   const void* body, int bodySize)
    {
        auto header = "HTTP/1.1 " + juce::String (status) + " " + reason + "\r\n"
                    + "Access-Control-Allow-Origin: *\r\n"
                    + "Access-Control-Allow-Headers: Content-Type\r\n"
                    + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n";

        if (contentType.isNotEmpty())
            header << "Content-Type: " << contentType << "\r\n";

        header << "Content-Length: " << juce::String (bodySize) << "\r\n\r\n";

        const auto utf8 = header.toRawUTF8();

        if (! writeAll (utf8, (int) std::strlen (utf8)))
            return;

        if (body != nullptr && bodySize > 0)
            writeAll (body, bodySize);
    }

    void sendHttpText (int status, const juce::String& reason, const juce::String& contentType,
                       const juce::String& body)
    {
        const auto utf8 = body.toRawUTF8();
        sendHttp (status, reason, contentType, utf8, (int) std::strlen (utf8));
    }

    bool sendFrame (int opcode, const void* payload, int size)
    {
        juce::uint8 header[10];
        int headerSize = 2;
        header[0] = (juce::uint8) (0x80 | (opcode & 0x0f));

        if (size < 126)
        {
            header[1] = (juce::uint8) size;
        }
        else if (size <= 65535)
        {
            header[1] = 126;
            header[2] = (juce::uint8) (size >> 8);
            header[3] = (juce::uint8) size;
            headerSize = 4;
        }
        else
        {
            return false;
        }

        juce::MemoryBlock frame;
        frame.append (header, (size_t) headerSize);

        if (payload != nullptr && size > 0)
            frame.append (payload, (size_t) size);

        return writeAll (frame.getData(), (int) frame.getSize());
    }

    void flushOutbound()
    {
        juce::StringArray batch;
        {
            const juce::ScopedLock sl (outLock);
            outbound.swapWith (batch);
        }

        for (const auto& text : batch)
        {
            const auto utf8 = text.toRawUTF8();

            if (! sendFrame (1, utf8, (int) std::strlen (utf8)))
                break;
        }
    }

    void handleHttp (const juce::String& method, juce::String path)
    {
        if (method == "OPTIONS")
        {
            sendHttp (204, "No Content", {}, nullptr, 0);
            return;
        }

        if (method != "GET" && method != "HEAD")
        {
            sendHttpText (405, "Method Not Allowed", "text/plain", "Method Not Allowed");
            return;
        }

        if (path == "/health" || path == "/api/health")
        {
            sendHttpText (200, "OK", "application/json; charset=utf-8", jsonLine (owner.makeHealth()));
            return;
        }

        if (path == "/api/state")
        {
            juce::String body;
            juce::WaitableEvent done;

            juce::MessageManager::callAsync ([this, &body, &done]
            {
                if (owner.serving.load())
                    body = jsonLine (owner.api.describeProject());

                done.signal();
            });

            done.wait (2000);
            sendHttpText (200, "OK", "application/json; charset=utf-8",
                          body.isNotEmpty() ? body : "{\"ok\":false}");
            return;
        }

        if (path.isEmpty() || path == "/")
            path = "/index.html";

        if (owner.webRoot.isDirectory())
        {
            auto file = owner.webRoot.getChildFile (path.substring (1));

            if (! file.existsAsFile())
                file = owner.webRoot.getChildFile ("index.html");

            if (file.existsAsFile()
                && (file.isAChildOf (owner.webRoot) || file == owner.webRoot.getChildFile ("index.html")))
            {
                juce::MemoryBlock data;
                file.loadFileAsData (data);
                sendHttp (200, "OK", mimeFor (file), data.getData(), (int) data.getSize());
                return;
            }
        }

        if (path == "/index.html")
        {
            sendHttpText (200, "OK", "text/html; charset=utf-8", owner.makeLandingPage());
            return;
        }

        sendHttpText (404, "Not Found", "text/plain", "Not Found");
    }

    void serveWebSocket (juce::MemoryBlock& leftover, int headerEnd)
    {
        juce::MemoryBlock pending;
        const auto extra = (int) leftover.getSize() - headerEnd;

        if (extra > 0)
            pending.append (static_cast<const char*> (leftover.getData()) + headerEnd, (size_t) extra);

        juce::MemoryBlock message;
        int messageOpcode = 0;

        while (! threadShouldExit())
        {
            flushOutbound();

            juce::uint8 header[2];

            if (! takeBytes (pending, header, 2))
                break;

            const auto fin = (header[0] & 0x80) != 0;
            const auto opcode = header[0] & 0x0f;
            const auto masked = (header[1] & 0x80) != 0;
            juce::uint64 length = header[1] & 0x7f;

            if (length == 126)
            {
                juce::uint8 ext[2];
                if (! takeBytes (pending, ext, 2))
                    break;
                length = (juce::uint64) ((ext[0] << 8) | ext[1]);
            }
            else if (length == 127)
            {
                juce::uint8 ext[8];
                if (! takeBytes (pending, ext, 8))
                    break;
                length = 0;
                for (auto b : ext)
                    length = (length << 8) | b;
            }

            if (length > (juce::uint64) maxFrameBytes)
                break;

            juce::uint8 mask[4] {};

            if (masked && ! takeBytes (pending, mask, 4))
                break;

            juce::MemoryBlock payload;
            payload.setSize ((size_t) length, true);

            if (length > 0 && ! takeBytes (pending, payload.getData(), (int) length))
                break;

            if (masked)
            {
                auto* bytes = static_cast<juce::uint8*> (payload.getData());
                for (juce::uint64 i = 0; i < length; ++i)
                    bytes[i] = (juce::uint8) (bytes[i] ^ mask[i % 4]);
            }

            if (opcode == 8)
            {
                sendFrame (8, payload.getData(), (int) payload.getSize());
                break;
            }

            if (opcode == 9)
            {
                sendFrame (10, payload.getData(), (int) payload.getSize());
                continue;
            }

            if (opcode == 10)
                continue;

            if (opcode == 1 || opcode == 2)
            {
                message = payload;
                messageOpcode = opcode;
            }
            else if (opcode == 0)
            {
                message.append (payload.getData(), payload.getSize());
            }
            else
            {
                continue;
            }

            if (! fin)
                continue;

            if (messageOpcode == 1)
            {
                const auto text = juce::String::fromUTF8 (static_cast<const char*> (message.getData()),
                                                          (int) message.getSize());
                owner.postCommand (this, text);
            }

            message.reset();
            messageOpcode = 0;
        }
    }

    bool takeBytes (juce::MemoryBlock& pending, void* dest, int bytes)
    {
        auto* out = static_cast<char*> (dest);

        while ((int) pending.getSize() < bytes)
        {
            flushOutbound();

            juce::uint8 chunk[2048];
            const auto n = readSome (chunk, (int) sizeof (chunk), 50);

            if (n < 0)
                return false;

            if (n == 0)
            {
                if (threadShouldExit())
                    return false;

                continue;
            }

            pending.append (chunk, (size_t) n);
        }

        std::memcpy (out, pending.getData(), (size_t) bytes);
        juce::MemoryBlock rest;
        rest.append (static_cast<const char*> (pending.getData()) + bytes,
                     pending.getSize() - (size_t) bytes);
        pending = std::move (rest);
        return true;
    }

    WebGateway& owner;
    std::unique_ptr<juce::StreamingSocket> socket;
    juce::CriticalSection writeLock;
    juce::CriticalSection outLock;
    juce::StringArray outbound;
    std::atomic<bool> websocket { false };
    std::atomic<bool> audioSubscribed { false };
    std::atomic<bool> audioChannel { false };
};

//==============================================================================
class WebGateway::AudioPump  : public juce::Thread
{
public:
    explicit AudioPump (WebGateway& ownerToUse)
        : juce::Thread ("DawWeb-AudioTap"),
          owner (ownerToUse)
    {
    }

    void run() override
    {
        while (! threadShouldExit())
        {
            owner.pumpRemoteAudio();
            wait (4);
        }
    }

private:
    WebGateway& owner;
};

//==============================================================================
WebGateway::WebGateway (EngineAPI& engineToServe)
    : juce::Thread ("DawWeb-HTTP"),
      api (engineToServe)
{
    api.addListener (this);
}

WebGateway::~WebGateway()
{
    stop();
    api.removeListener (this);
}

bool WebGateway::start (int preferredPort)
{
    stop();
    webRoot = findWebRoot();
    juce::Logger::writeToLog ("Web gateway: binding 0.0.0.0:"
                              + juce::String (firstPort) + "-" + juce::String (lastPort)
                              + " (localhost + LAN)");

    const auto first = juce::jlimit (firstPort, lastPort, preferredPort);

    for (int candidate = first; candidate <= lastPort; ++candidate)
    {
        listener.close();

        if (listener.createListener (candidate, {}))
        {
            port = candidate;
            serving.store (true);
            startThread();
            startTimerHz (20);
            audioPump = std::make_unique<AudioPump> (*this);
            audioPump->startThread();
            juce::Logger::writeToLog ("Web gateway listening on " + getListenUrls().joinIntoString (", "));

            if (webRoot.isDirectory())
                juce::Logger::writeToLog ("Serving Vue UI from " + webRoot.getFullPathName());
            else
                juce::Logger::writeToLog ("No Vue dist found; landing page will point at npm run dev:h5");

            return true;
        }
    }

    port = 0;
    juce::Logger::writeToLog ("Web gateway could not bind 0.0.0.0:"
                              + juce::String (firstPort) + "-" + juce::String (lastPort));
    return false;
}

void WebGateway::stop()
{
    serving.store (false);
    stopTimer();
    signalThreadShouldExit();
    listener.close();

    if (audioPump != nullptr)
    {
        audioPump->signalThreadShouldExit();
        audioPump->stopThread (1000);
        audioPump.reset();
    }

    {
        const juce::ScopedLock sl (lock);

        for (auto* connection : connections)
            connection->closeSocket();
    }

    waitForThreadToExit (2000);

    const juce::ScopedLock sl (lock);
    connections.clear();
    port = 0;
}

juce::String WebGateway::getListenUrl() const
{
    return port > 0 ? "http://127.0.0.1:" + juce::String (port) : juce::String();
}

juce::String WebGateway::getWebSocketUrl() const
{
    return port > 0 ? "ws://127.0.0.1:" + juce::String (port) : juce::String();
}

juce::String WebGateway::getAudioWebSocketUrl() const
{
    return port > 0 ? "ws://127.0.0.1:" + juce::String (port) + "/audio" : juce::String();
}

juce::StringArray WebGateway::getLanAddresses() const
{
    juce::Array<juce::IPAddress> addresses;
    juce::IPAddress::findAllAddresses (addresses, false);
    juce::StringArray result;

    for (const auto& address : addresses)
    {
        const auto text = address.toString();

        if (text == "127.0.0.1" || text == "0.0.0.0" || text.startsWith ("169.254.")
            || text.startsWith ("224.") || text.startsWith ("239."))
            continue;

        result.addIfNotAlreadyThere (text);
    }

    return result;
}

juce::StringArray WebGateway::getListenUrls() const
{
    juce::StringArray urls;

    if (port <= 0)
        return urls;

    const auto suffix = ":" + juce::String (port);
    urls.add ("http://127.0.0.1" + suffix);
    urls.add ("http://localhost" + suffix);

    for (const auto& address : getLanAddresses())
        urls.add ("http://" + address + suffix);

    return urls;
}

int WebGateway::getNumClients() const
{
    const juce::ScopedLock sl (lock);
    return connections.size();
}

int WebGateway::getNumAudioClients() const
{
    const juce::ScopedLock sl (lock);
    int count = 0;

    for (auto* connection : connections)
        if (connection->isAudioChannel())
            ++count;

    return count;
}

void WebGateway::onEngineChanged (int changeFlags)
{
    dirtyFlags.fetch_or (changeFlags);
    stateDirty.store (true);
}

void WebGateway::run()
{
    while (! threadShouldExit())
    {
        if (listener.waitUntilReady (true, 250) != 1)
            continue;

        std::unique_ptr<juce::StreamingSocket> accepted (listener.waitForNextConnection());

        if (accepted == nullptr)
            continue;

        auto* connection = new Connection (*this, std::move (accepted));

        {
            const juce::ScopedLock sl (lock);
            connections.add (connection);
        }

        connection->startThread();
    }
}

void WebGateway::timerCallback()
{
    if (! serving.load())
        return;

    api.flushPendingUpdates();

    if (stateDirty.exchange (false))
    {
        const auto flags = dirtyFlags.exchange (0);
        const auto modelFlags = flags & ~(EngineAPI::transportChanged);
        const bool notesOnly = (modelFlags & EngineAPI::notesChanged) != 0
                            && (modelFlags & ~EngineAPI::notesChanged) == 0;

        if (notesOnly)
        {
            auto delta = api.takeNoteDelta();
            auto* object = new juce::DynamicObject();

            if (delta.isObject())
            {
                object->setProperty ("type", "event.noteDelta");
                object->setProperty ("delta", delta);
            }
            else
            {
                object->setProperty ("type", "event.notes");
                object->setProperty ("notes", api.describeNotes());
            }

            broadcastText (jsonLine (juce::var (object)));
        }
        else
        {
            api.takeNoteDelta();
            auto* object = new juce::DynamicObject();
            object->setProperty ("type", "event.state");
            object->setProperty ("project", api.describeProject());
            broadcastText (jsonLine (juce::var (object)));
        }
    }

    const auto beats = api.getPositionBeats();
    const auto playing = api.isPlaying();

    if (playing
        || std::abs (beats - lastClockBeats) > 1.0e-4
        || playing != lastClockPlaying)
    {
        lastClockBeats = beats;
        lastClockPlaying = playing;
        broadcastText (jsonLine (api.describeClock()));
    }

    juce::OwnedArray<Connection> finished;
    {
        const juce::ScopedLock sl (lock);

        for (int i = connections.size(); --i >= 0;)
            if (! connections[i]->isThreadRunning())
                finished.add (connections.removeAndReturn (i));
    }

    if (finished.size() > 0)
        refreshAudioTap();

    refreshAudioTap();
}

void WebGateway::postCommand (Connection* connection, juce::String jsonText)
{
    juce::MessageManager::callAsync ([this, connection, jsonText]()
    {
        if (! serving.load())
            return;

        {
            const juce::ScopedLock sl (lock);

            if (! connections.contains (connection) || ! connection->isThreadRunning())
                return;
        }

        juce::var parsed;
        auto reply = juce::JSON::parse (jsonText, parsed).failed()
                         ? api.handleMessage (jsonText)
                         : api.handleMessage (parsed);

        const auto type = parsed.getProperty ("type", juce::var()).toString();

        if (type == "audio.subscribe")
            connection->setAudioSubscribed (true);
        else if (type == "audio.unsubscribe")
            connection->setAudioSubscribed (false);

        refreshAudioTap();

        if (auto* object = reply.getDynamicObject())
        {
            const auto id = parsed.getProperty ("id", juce::var());

            if (! id.isVoid())
                object->setProperty ("id", id);

            object->setProperty ("replyTo", parsed.getProperty ("type", juce::var()));
        }

        connection->sendText (jsonLine (reply));
        api.flushPendingUpdates();
    });
}

void WebGateway::broadcastText (const juce::String& jsonText)
{
    juce::Array<Connection*> live;
    {
        const juce::ScopedLock sl (lock);

        for (auto* connection : connections)
            if (connection->isWebSocket() && connection->isThreadRunning())
                live.add (connection);
    }

    for (auto* connection : live)
        connection->sendText (jsonText);
}

void WebGateway::refreshAudioTap()
{
    api.getEngine().getRemoteAudio().setEnabled (getNumAudioClients() > 0);
}

void WebGateway::pumpRemoteAudio()
{
    if (! serving.load())
        return;

    juce::Array<Connection*> live;
    {
        const juce::ScopedLock sl (lock);

        for (auto* connection : connections)
            if (connection->isWebSocket() && connection->isAudioChannel() && connection->isThreadRunning())
                live.add (connection);
    }

    if (live.isEmpty())
        return;

    juce::MemoryBlock packet;

    if (! api.getEngine().getRemoteAudio().pullPacket (packet, 256))
        return;

    for (auto* connection : live)
        connection->sendBinary (packet.getData(), (int) packet.getSize());
}

juce::var WebGateway::makeHealth() const
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", true);
    object->setProperty ("port", port);
    object->setProperty ("sessionId", api.getSessionId());
    object->setProperty ("schemaVersion", ProjectSchema::currentVersion);
    object->setProperty ("maxAudioSessions", EngineAPI::maxAudioSessions);
    object->setProperty ("ws", getWebSocketUrl());
    object->setProperty ("audioWs", getAudioWebSocketUrl());
    object->setProperty ("http", getListenUrl());
    object->setProperty ("clients", getNumClients());
    object->setProperty ("audioClients", getNumAudioClients());
    object->setProperty ("webRoot", webRoot.getFullPathName());
    object->setProperty ("control", "websocket-json");
    object->setProperty ("audioTransport", "websocket-binary-pcm-v1");
    object->setProperty ("audioTransportIsPrototype", true);

    juce::Array<juce::var> lan;
    for (const auto& address : getLanAddresses())
        lan.add (address);
    object->setProperty ("lan", lan);

    juce::Array<juce::var> urls;
    for (const auto& url : getListenUrls())
        urls.add (url);
    object->setProperty ("urls", urls);

    return juce::var (object);
}

juce::File WebGateway::findWebRoot() const
{
    auto cursor = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();

    for (int i = 0; i < 12; ++i)
    {
        const auto dist = cursor.getChildFile ("uni-preset-vue-vite")
                                .getChildFile ("uni-preset-vue-vite")
                                .getChildFile ("dist")
                                .getChildFile ("build")
                                .getChildFile ("h5");

        if (dist.getChildFile ("index.html").existsAsFile())
            return dist;

        const auto webui = cursor.getChildFile ("WebUI");

        if (webui.getChildFile ("index.html").existsAsFile())
            return webui;

        const auto parent = cursor.getParentDirectory();

        if (parent == cursor)
            break;

        cursor = parent;
    }

    return {};
}

juce::String WebGateway::makeLandingPage() const
{
    const auto ws = getWebSocketUrl();
    const auto http = getListenUrl();
    const auto lan = getLanAddresses().joinIntoString (", ");
    const auto urls = getListenUrls().joinIntoString ("<br/>");

    return R"(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>DawWeb Engine</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background:#121212; color:#e6e6e6; margin:0; padding:48px; }
    a { color:#cfc6b8; }
    code { background:#1e1e1e; padding:2px 6px; border-radius:4px; }
    .card { max-width:680px; background:#161616; border:1px solid #2a2a2a;
            border-radius:12px; padding:28px; }
    h1 { margin-top:0; font-size:22px; font-weight:600; }
    p { line-height:1.55; color:#b8b8b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>DawWeb Engine</h1>
    <p>One audio session. JSON WebSocket is the control channel.
       Mixed stereo PCM uses a separate <code>/audio</code> WebSocket (prototype, not WebRTC).</p>
    <p>Local: <code>)" + http + R"(</code><br/>
       Control: <code>)" + ws + R"(</code><br/>
       Audio: <code>)" + getAudioWebSocketUrl() + R"(</code></p>
    <p>LAN addresses: <code>)" + (lan.isNotEmpty() ? lan : juce::String ("none")) + R"(</code></p>
    <p>)" + urls + R"(</p>
    <p>Same Vue UI: open this host from a tablet on the LAN, or run
       <code>npm run dev:h5</code> and connect to the PC IP.</p>
    <p>Windows may prompt for a firewall allow on first LAN bind.</p>
  </div>
</body>
</html>)";
}
