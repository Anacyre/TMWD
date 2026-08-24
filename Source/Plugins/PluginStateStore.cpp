#include "PluginStateStore.h"
#include <cstring>

PluginStateStore::PluginStateStore (const juce::File& configFile)
{
    const auto env = juce::SystemStats::getEnvironmentVariable ("DAWWEB_RESOURCE_ROOT", {});

    if (env.isNotEmpty())
    {
        const juce::File root (env);
        searchRoots.add (root.getChildFile ("instruments"));
        searchRoots.add (root.getChildFile ("states"));
        searchRoots.add (root);
    }

    const auto exe = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
    searchRoots.add (exe.getSiblingFile ("Resources").getChildFile ("instruments"));

    auto dir = exe.getParentDirectory();

    for (int i = 0; i < 8 && dir != dir.getParentDirectory(); ++i)
    {
        searchRoots.add (dir.getChildFile ("Source").getChildFile ("Resources").getChildFile ("instruments"));
        dir = dir.getParentDirectory();
    }

    if (configFile.existsAsFile())
        searchRoots.add (configFile.getParentDirectory().getChildFile ("instruments"));

    searchRoots.add (juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                         .getChildFile ("DawWeb")
                         .getChildFile ("instruments"));
}

juce::File PluginStateStore::getWriteDirectory() const
{
    for (const auto& root : searchRoots)
    {
        if (root.getParentDirectory().getChildFile ("instruments.json").existsAsFile())
        {
            root.createDirectory();
            return root;
        }
    }

    for (const auto& root : searchRoots)
        if (root.getFileName() == "instruments")
        {
            root.createDirectory();
            return root;
        }

    const auto appData = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                             .getChildFile ("DawWeb")
                             .getChildFile ("instruments");
    appData.createDirectory();
    return appData;
}

juce::File PluginStateStore::resolveStateFile (const PresetDefinition& preset) const
{
    if (preset.stateFile.isEmpty())
        return {};

    if (juce::File::isAbsolutePath (preset.stateFile))
        return juce::File (preset.stateFile);

    for (const auto& root : searchRoots)
    {
        const auto candidate = root.getChildFile (preset.stateFile);

        if (candidate.existsAsFile())
            return candidate;
    }

    return getWriteDirectory().getChildFile (preset.stateFile);
}

bool PluginStateStore::hasState (const PresetDefinition& preset) const
{
    const auto file = resolveStateFile (preset);
    return file.existsAsFile() && file.getSize() > 0;
}

bool PluginStateStore::loadState (const PresetDefinition& preset, juce::MemoryBlock& dest) const
{
    dest.reset();
    const auto file = resolveStateFile (preset);

    if (! file.existsAsFile())
        return false;

    return file.loadFileAsData (dest) && dest.getSize() > 0;
}

bool PluginStateStore::saveState (const PresetDefinition& preset, const juce::MemoryBlock& state) const
{
    return saveState (preset, state, {});
}

juce::File PluginStateStore::resolveMetadataFile (const PresetDefinition& preset) const
{
    const auto stateFile = resolveStateFile (preset);

    if (stateFile == juce::File())
        return {};

    return stateFile.getParentDirectory().getChildFile (stateFile.getFileNameWithoutExtension() + ".meta.json");
}

juce::String PluginStateStore::hashState (const juce::MemoryBlock& state) const
{
    // FNV-1a 64-bit.  juce_cryptography is not linked; this is enough to detect
    // swapped or truncated factory blobs without adding a new JUCE module.
    juce::uint64 hash = 14695981039346656037ull;
    const auto* data = static_cast<const unsigned char*> (state.getData());

    for (size_t i = 0; i < state.getSize(); ++i)
    {
        hash ^= data[i];
        hash *= 1099511628211ull;
    }

    return juce::String::formatted ("%016llx-%lld",
                                    (unsigned long long) hash,
                                    (long long) state.getSize());
}

bool PluginStateStore::statesEqual (const juce::MemoryBlock& a, const juce::MemoryBlock& b) const
{
    return a.getSize() == b.getSize()
        && (a.getSize() == 0 || std::memcmp (a.getData(), b.getData(), a.getSize()) == 0);
}

bool PluginStateStore::matchesDefaultDump (const juce::String& pluginId, const juce::MemoryBlock& state) const
{
    juce::String dumpName;

    if (pluginId == "bbcso_discover")
        dumpName = "bbcso_default";
    else if (pluginId == "synchron_player")
        dumpName = "synchron_default";
    else
        return false;

    const auto file = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                          .getChildFile ("DawWeb")
                          .getChildFile ("state-dumps")
                          .getChildFile (dumpName + ".state");

    if (! file.existsAsFile() || (juce::int64) state.getSize() != file.getSize())
        return false;

    juce::MemoryBlock dumped;

    if (! file.loadFileAsData (dumped))
        return false;

    return statesEqual (dumped, state);
}

bool PluginStateStore::isTrustedFactoryState (const PresetDefinition& preset, const juce::MemoryBlock& state) const
{
    if (state.isEmpty())
        return false;

    if (matchesDefaultDump (preset.pluginId, state))
        return false;

    // The unpatched BBCSO default chunk is 502 bytes.  A named factory capture must
    // be a real patch, not that empty default.
    if ((preset.pluginId == "bbcso_discover" || preset.pluginId == "synchron_player")
        && state.getSize() < 1024)
        return false;

    return true;
}

StateMetadata PluginStateStore::makeMetadata (const PresetDefinition& preset, const juce::MemoryBlock& state,
                                              const juce::String& pluginVersion) const
{
    StateMetadata metadata;
    metadata.id = preset.id;
    metadata.pluginId = preset.pluginId;
    metadata.instrument = preset.instrumentName.isNotEmpty() ? preset.instrumentName : preset.displayName;
    metadata.technique = preset.technique;
    metadata.library = preset.libraryName;
    metadata.stateFile = preset.stateFile;
    metadata.stateVersion = preset.stateVersion > 0 ? preset.stateVersion : 1;
    metadata.pluginVersion = pluginVersion.isNotEmpty() ? pluginVersion : preset.pluginVersion;
    metadata.libraryVersion = preset.libraryVersion;
    metadata.checksum = hashState (state);
    metadata.capturedAt = juce::Time::getCurrentTime().toISO8601 (true);
    metadata.byteSize = (juce::int64) state.getSize();
    return metadata;
}

bool PluginStateStore::saveMetadata (const PresetDefinition& preset, const StateMetadata& metadata) const
{
    auto file = resolveMetadataFile (preset);

    if (file == juce::File())
        file = getWriteDirectory().getChildFile (juce::File (preset.stateFile).getFileNameWithoutExtension() + ".meta.json");

    auto* object = new juce::DynamicObject();
    object->setProperty ("id", metadata.id);
    object->setProperty ("plugin", metadata.pluginId);
    object->setProperty ("instrument", metadata.instrument);
    object->setProperty ("technique", metadata.technique);
    object->setProperty ("library", metadata.library);
    object->setProperty ("stateFile", metadata.stateFile);
    object->setProperty ("stateVersion", metadata.stateVersion);
    object->setProperty ("pluginVersion", metadata.pluginVersion);
    object->setProperty ("libraryVersion", metadata.libraryVersion);
    object->setProperty ("checksum", metadata.checksum);
    object->setProperty ("capturedAt", metadata.capturedAt);
    object->setProperty ("byteSize", (int) metadata.byteSize);

    file.getParentDirectory().createDirectory();
    return file.replaceWithText (juce::JSON::toString (juce::var (object), true));
}

bool PluginStateStore::loadMetadata (const PresetDefinition& preset, StateMetadata& dest) const
{
    dest = {};
    const auto file = resolveMetadataFile (preset);

    if (! file.existsAsFile())
        return false;

    const auto parsed = juce::JSON::parse (file.loadFileAsString());

    if (! parsed.isObject())
        return false;

    dest.id = parsed.getProperty ("id", {}).toString();
    dest.pluginId = parsed.getProperty ("plugin", parsed.getProperty ("pluginId", {})).toString();
    dest.instrument = parsed.getProperty ("instrument", {}).toString();
    dest.technique = parsed.getProperty ("technique", {}).toString();
    dest.library = parsed.getProperty ("library", {}).toString();
    dest.stateFile = parsed.getProperty ("stateFile", {}).toString();
    dest.stateVersion = (int) parsed.getProperty ("stateVersion", 1);
    dest.pluginVersion = parsed.getProperty ("pluginVersion", {}).toString();
    dest.libraryVersion = parsed.getProperty ("libraryVersion", {}).toString();
    dest.checksum = parsed.getProperty ("checksum", {}).toString();
    dest.capturedAt = parsed.getProperty ("capturedAt", {}).toString();
    dest.byteSize = (juce::int64) (int) parsed.getProperty ("byteSize", 0);
    return dest.id.isNotEmpty();
}

bool PluginStateStore::verifyIntegrity (const PresetDefinition& preset, const juce::MemoryBlock& state,
                                        juce::String& error) const
{
    if (state.isEmpty())
    {
        error = preset.displayName + " state is empty.";
        return false;
    }

    StateMetadata metadata;

    if (! loadMetadata (preset, metadata))
        return true;

    if (metadata.id.isNotEmpty() && metadata.id != preset.id)
    {
        error = preset.displayName + " metadata id does not match " + preset.id + ".";
        return false;
    }

    if (metadata.pluginId.isNotEmpty() && metadata.pluginId != preset.pluginId)
    {
        error = preset.displayName + " was captured for a different plugin.";
        return false;
    }

    if (metadata.checksum.isNotEmpty() && metadata.checksum != hashState (state))
    {
        error = preset.displayName + " state checksum does not match.";
        return false;
    }

    return true;
}

bool PluginStateStore::saveState (const PresetDefinition& preset, const juce::MemoryBlock& state,
                                  const juce::String& pluginVersion) const
{
    if (preset.stateFile.isEmpty() || state.isEmpty())
        return false;

    auto file = resolveStateFile (preset);

    if (file == juce::File() || file.existsAsFile() == false)
        file = getWriteDirectory().getChildFile (preset.stateFile);

    file.getParentDirectory().createDirectory();

    if (! file.replaceWithData (state.getData(), state.getSize()))
        return false;

    return saveMetadata (preset, makeMetadata (preset, state, pluginVersion));
}

juce::String PluginStateStore::extractPrintableStrings (const juce::MemoryBlock& state) const
{
    juce::String text;
    const auto* data = static_cast<const char*> (state.getData());
    const auto size = (int) state.getSize();
    juce::String current;

    for (int i = 0; i < size; ++i)
    {
        const auto c = (unsigned char) data[i];

        if (c >= 32 && c < 127)
        {
            current << (char) c;
        }
        else if (current.length() >= 4)
        {
            text << current << "\n";
            current.clear();
        }
        else
        {
            current.clear();
        }
    }

    if (current.length() >= 4)
        text << current << "\n";

    return text;
}

void PluginStateStore::writeDump (const juce::String& name, const juce::MemoryBlock& state) const
{
    const auto dir = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                         .getChildFile ("DawWeb")
                         .getChildFile ("state-dumps");
    dir.createDirectory();
    dir.getChildFile (name + ".state").replaceWithData (state.getData(), state.getSize());
    dir.getChildFile (name + "-strings.txt").replaceWithText (extractPrintableStrings (state));
}

namespace
{
    int replaceRaw (juce::MemoryBlock& state, const void* needle, size_t needleLen,
                    const void* replacement, size_t replacementLen)
    {
        if (needle == nullptr || needleLen == 0 || replacement == nullptr || needleLen != replacementLen)
            return 0;

        auto* data = static_cast<char*> (state.getData());
        const auto size = state.getSize();
        int count = 0;

        for (size_t i = 0; i + needleLen <= size; ++i)
        {
            if (std::memcmp (data + i, needle, needleLen) == 0)
            {
                std::memcpy (data + i, replacement, replacementLen);
                ++count;
                i += needleLen - 1;
            }
        }

        return count;
    }
}

int PluginStateStore::replaceAsciiAndUtf16 (juce::MemoryBlock& state,
                                            const juce::String& needle,
                                            const juce::String& replacement) const
{
    if (needle.isEmpty() || needle.length() != replacement.length())
        return 0;

    const auto utf8Needle = needle.toRawUTF8();
    const auto utf8Replacement = replacement.toRawUTF8();
    const auto utf8Len = std::strlen (utf8Needle);
    int count = replaceRaw (state, utf8Needle, utf8Len, utf8Replacement, std::strlen (utf8Replacement));

    juce::MemoryBlock wideNeedle, wideReplacement;
    const auto utf16Needle = needle.toUTF16();
    const auto utf16Replacement = replacement.toUTF16();
    wideNeedle.append (utf16Needle.getAddress(), (size_t) utf16Needle.sizeInBytes() - sizeof (juce::CharPointer_UTF16::CharType));
    wideReplacement.append (utf16Replacement.getAddress(), (size_t) utf16Replacement.sizeInBytes() - sizeof (juce::CharPointer_UTF16::CharType));

    if (wideNeedle.getSize() == wideReplacement.getSize() && wideNeedle.getSize() > 0)
        count += replaceRaw (state, wideNeedle.getData(), wideNeedle.getSize(),
                             wideReplacement.getData(), wideReplacement.getSize());

    return count;
}

bool PluginStateStore::containsAsciiOrUtf16 (const juce::MemoryBlock& state, const juce::String& needle) const
{
    if (needle.isEmpty() || state.isEmpty())
        return false;

    const auto text = extractPrintableStrings (state);

    if (text.containsIgnoreCase (needle))
        return true;

    const auto utf16 = needle.toUTF16();
    const auto wideLen = (size_t) utf16.sizeInBytes() - sizeof (juce::CharPointer_UTF16::CharType);

    if (wideLen == 0 || wideLen > state.getSize())
        return false;

    const auto* data = static_cast<const char*> (state.getData());

    for (size_t i = 0; i + wideLen <= state.getSize(); ++i)
        if (std::memcmp (data + i, utf16.getAddress(), wideLen) == 0)
            return true;

    return false;
}
