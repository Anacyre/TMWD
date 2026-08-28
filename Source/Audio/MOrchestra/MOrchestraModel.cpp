#include "MOrchestraModel.h"

namespace MOrchestra
{
namespace
{
    bool isNoteToken (const juce::String& token)
    {
        if (token.length() < 2)
            return false;

        const auto first = token[0];
        if (first < 'A' || first > 'G')
            return false;

        return token.containsAnyOf ("0123456789");
    }

    bool isPrimaryArtic (const juce::String& artic)
    {
        const auto a = artic.toLowerCase();
        return a == "arco-normal" || a == "normal" || a == "struck-singly"
            || a.contains ("mallet") || a.contains ("stick") || a.contains ("beater");
    }

    bool shouldSkipDuration (const juce::String& duration)
    {
        const auto d = duration.toLowerCase();
        return d == "phrase" || d == "rhythm";
    }

    juce::String readString (const juce::var& object, const char* name, const juce::String& fallback = {})
    {
        return object.getProperty (name, juce::var (fallback)).toString();
    }

    int readInt (const juce::var& object, const char* name, int fallback)
    {
        const auto value = object.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (int) value;
    }

    float readFloat (const juce::var& object, const char* name, float fallback)
    {
        const auto value = object.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (float) (double) value;
    }

    bool readBool (const juce::var& object, const char* name, bool fallback)
    {
        const auto value = object.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (bool) value;
    }

    InstrumentSpec parseInstrument (const juce::var& entry)
    {
        InstrumentSpec spec;
        spec.id = readString (entry, "id");
        spec.name = readString (entry, "name");
        spec.family = familyFromString (readString (entry, "family"));
        spec.sectionSize = juce::jmax (1, readInt (entry, "sectionSize", 1));
        spec.sourceVoices = juce::jlimit (1, 4, readInt (entry, "sourceVoices", 1));
        spec.maxVoices = juce::jlimit (1, 64, readInt (entry, "maxVoices", 16));
        spec.pack = readString (entry, "pack");
        spec.percFolder = readString (entry, "percFolder");
        spec.solo = readBool (entry, "solo", spec.sectionSize <= 1 && spec.family == Family::solo);
        spec.vibrato = readBool (entry, "vibrato", false);
        spec.gamma = readFloat (entry, "gamma", 1.35f);
        spec.noise = noiseFromString (readString (entry, "noise"));
        spec.uncoveredReason = readString (entry, "uncoveredReason");

        const auto arts = entry.getProperty ("articulations", juce::var());
        if (auto* array = arts.getArray())
            for (const auto& item : *array)
                spec.articulations.push_back (articulationFromString (item.toString()));

        if (spec.articulations.empty())
            spec.articulations.push_back (Articulation::longArt);

        return spec;
    }
}

int parseMidiNote (const juce::String& token)
{
    if (token.length() < 2)
        return 60;

    const auto letter = token[0];
    int semitone = 0;

    switch (letter)
    {
        case 'C': semitone = 0;  break;
        case 'D': semitone = 2;  break;
        case 'E': semitone = 4;  break;
        case 'F': semitone = 5;  break;
        case 'G': semitone = 7;  break;
        case 'A': semitone = 9;  break;
        case 'B': semitone = 11; break;
        default:  return 60;
    }

    int index = 1;
    if (index < token.length() && (token[index] == 's' || token[index] == '#'))
    {
        ++semitone;
        ++index;
    }
    else if (index < token.length() && (token[index] == 'b' || token[index] == 'f'))
    {
        --semitone;
        ++index;
    }

    const auto octave = token.substring (index).getIntValue();
    return juce::jlimit (0, 127, (octave + 1) * 12 + semitone);
}

int dynamicToLayer (const juce::String& token)
{
    const auto t = token.toLowerCase();
    if (t.contains ("fortissimo") || t == "ff") return 120;
    if (t.contains ("pianissimo") || t == "pp") return 16;
    if (t == "forte" || t == "f") return 96;
    if (t == "piano" || t == "p") return 32;
    if (t.contains ("mezzo-forte") || t == "mf") return 72;
    if (t.contains ("mezzo-piano") || t == "mp") return 48;
    return 64;
}

Articulation classifyArticulation (const juce::String& duration, const juce::String& artic, bool percussion)
{
    juce::ignoreUnused (artic);

    if (percussion)
        return Articulation::hit;

    const auto d = duration.toLowerCase();
    if (d == "025" || d == "05")
        return Articulation::shortArt;

    return Articulation::longArt;
}

LibrarySpec loadLibrarySpec (const juce::File& jsonFile)
{
    LibrarySpec spec;

    if (! jsonFile.existsAsFile())
        return spec;

    const auto parsed = juce::JSON::parse (jsonFile.loadFileAsString());

    if (! parsed.isObject())
        return spec;

    spec.id = readString (parsed, "id", spec.id);
    spec.displayName = readString (parsed, "displayName", spec.displayName);
    spec.cacheBudgetMb = juce::jlimit (32, 1024, readInt (parsed, "cacheBudgetMb", spec.cacheBudgetMb));
    spec.globalMaxVoices = juce::jlimit (8, 256, readInt (parsed, "globalMaxVoices", spec.globalMaxVoices));

    const auto roots = parsed.getProperty ("libraryRoots", juce::var());
    if (auto* array = roots.getArray())
        for (const auto& item : *array)
            spec.libraryRoots.add (item.toString());

    const auto missing = parsed.getProperty ("missing", juce::var());
    if (auto* array = missing.getArray())
        for (const auto& item : *array)
            spec.missing.add (item.toString());

    const auto instruments = parsed.getProperty ("instruments", juce::var());
    if (auto* array = instruments.getArray())
        for (const auto& item : *array)
            spec.instruments.push_back (parseInstrument (item));

    return spec;
}

void scanPacks (LibrarySpec& spec, const juce::File& root)
{
    spec.samples.clear();

    if (! root.isDirectory())
        return;

    for (const auto& zipFile : root.findChildFiles (juce::File::findFiles, false, "*.zip"))
    {
        juce::ZipFile zip (zipFile);
        const auto pack = zipFile.getFileNameWithoutExtension();

        for (int i = 0; i < zip.getNumEntries(); ++i)
        {
            const auto* entry = zip.getEntry (i);

            if (entry == nullptr)
                continue;

            const auto path = entry->filename.replaceCharacter ('\\', '/');

            if (! path.endsWithIgnoreCase (".mp3") && ! path.endsWithIgnoreCase (".wav"))
                continue;

            const auto fileName = path.fromLastOccurrenceOf ("/", false, false);
            const auto stem = fileName.upToLastOccurrenceOf (".", false, false);
            auto tokens = juce::StringArray::fromTokens (stem, "_", {});
            tokens.removeEmptyStrings();

            SampleRef ref;
            ref.pack = pack;
            ref.entry = path;

            const auto slash = path.indexOfChar ('/');
            const bool percussion = pack.equalsIgnoreCase ("percussion") || slash >= 0;

            int noteIndex = -1;
            for (int t = 0; t < tokens.size(); ++t)
                if (isNoteToken (tokens[t]))
                {
                    noteIndex = t;
                    break;
                }

            juce::String duration, dynamic, artic;

            if (noteIndex >= 0 && noteIndex + 1 < tokens.size())
            {
                ref.rootNote = parseMidiNote (tokens[noteIndex]);
                ref.minNote = juce::jmax (0, ref.rootNote - 4);
                ref.maxNote = juce::jmin (127, ref.rootNote + 4);
                duration = tokens[noteIndex + 1];
                if (noteIndex + 2 < tokens.size())
                    dynamic = tokens[noteIndex + 2];
                if (noteIndex + 3 < tokens.size())
                    artic = tokens[noteIndex + 3];
                for (int t = noteIndex + 4; t < tokens.size(); ++t)
                    artic += "_" + tokens[t];
                ref.unpitched = false;
            }
            else
            {
                ref.unpitched = true;
                ref.rootNote = 60;
                ref.minNote = 0;
                ref.maxNote = 127;
                // percussion: name__duration_dynamic_artic
                if (tokens.size() >= 2)
                    duration = tokens[1];
                if (tokens.size() >= 3)
                    dynamic = tokens[2];
                if (tokens.size() >= 4)
                    artic = tokens[3];
                for (int t = 4; t < tokens.size(); ++t)
                    artic += "_" + tokens[t];
            }

            if (shouldSkipDuration (duration) || artic.containsIgnoreCase ("rhythm")
                || artic.containsIgnoreCase ("phrase") || artic.containsIgnoreCase ("roll"))
                continue;

            if (! percussion && ! isPrimaryArtic (artic) && artic.isNotEmpty())
                continue;

            ref.dynamicLayer = dynamicToLayer (dynamic);
            ref.articulation = classifyArticulation (duration, artic, percussion || ref.unpitched);
            ref.loop = ref.articulation == Articulation::longArt;
            spec.samples.push_back (std::move (ref));
        }
    }
}

juce::File resolveLibraryRoot (const LibrarySpec& spec)
{
    const auto env = juce::SystemStats::getEnvironmentVariable ("DAWWEB_M_ORCHESTRA_ROOT", {});

    if (env.isNotEmpty())
    {
        const juce::File fromEnv (env.replaceCharacter ('/', juce::File::getSeparatorChar()));
        if (fromEnv.isDirectory())
            return fromEnv;
    }

    for (const auto& path : spec.libraryRoots)
    {
        const juce::File candidate (path.replaceCharacter ('/', juce::File::getSeparatorChar()));
        if (candidate.isDirectory())
            return candidate;
    }

    return {};
}
}
