#include "InstrumentArtwork.h"

namespace InstrumentArtwork
{
namespace
{
    juce::File iconsDirectory()
    {
        const auto env = juce::SystemStats::getEnvironmentVariable ("DAWWEB_RESOURCE_ROOT", {});

        if (env.isNotEmpty())
        {
            const juce::File fromEnv (juce::File (env).getChildFile ("icons"));

            if (fromEnv.isDirectory())
                return fromEnv;
        }

        const auto exe = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
        const auto besideExe = exe.getSiblingFile ("Resources").getChildFile ("icons");

        if (besideExe.isDirectory())
            return besideExe;

        auto dir = exe.getParentDirectory();

        for (int i = 0; i < 8 && dir != dir.getParentDirectory(); ++i)
        {
            const auto candidate = dir.getChildFile ("Source").getChildFile ("Resources").getChildFile ("icons");

            if (candidate.isDirectory())
                return candidate;

            dir = dir.getParentDirectory();
        }

        return besideExe;
    }

    juce::Image loadSheet (const juce::String& fileName)
    {
        const auto file = iconsDirectory().getChildFile (fileName);

        if (! file.existsAsFile())
            return {};

        return juce::ImageFileFormat::loadFrom (file);
    }

    juce::Image toLightGlyph (juce::Image source)
    {
        if (! source.isValid())
            return {};

        auto image = source.convertedToFormat (juce::Image::ARGB);
        const auto w = image.getWidth();
        const auto h = image.getHeight();

        for (int y = 0; y < h; ++y)
            for (int x = 0; x < w; ++x)
            {
                const auto pixel = image.getPixelAt (x, y);
                const auto luma = pixel.getBrightness();
                const auto alpha = juce::jlimit (0.0f, 1.0f, (0.90f - luma) * 1.55f);
                image.setPixelAt (x, y, juce::Colour::fromFloatRGBA (0.93f, 0.93f, 0.94f, alpha));
            }

        return image;
    }

    juce::Image cropCell (const juce::Image& sheet, int columns, int rows, int column, int row, float inset = 0.08f)
    {
        if (! sheet.isValid() || columns <= 0 || rows <= 0)
            return {};

        const auto cellW = (float) sheet.getWidth() / (float) columns;
        const auto cellH = (float) sheet.getHeight() / (float) rows;
        auto bounds = juce::Rectangle<float> ((float) column * cellW,
                                              (float) row * cellH,
                                              cellW,
                                              cellH).reduced (cellW * inset, cellH * inset);
        bounds = bounds.getIntersection (sheet.getBounds().toFloat());

        if (bounds.getWidth() < 8.0f || bounds.getHeight() < 8.0f)
            return {};

        return toLightGlyph (sheet.getClippedImage (bounds.toNearestInt()));
    }

    juce::Image choirGlyph()
    {
        juce::Image image (juce::Image::ARGB, 256, 256, true);
        juce::Graphics g (image);
        g.setColour (juce::Colour::fromFloatRGBA (0.93f, 0.93f, 0.94f, 1.0f));
        juce::PathStrokeType stroke (7.0f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded);

        const float centres[] = { 64.0f, 128.0f, 192.0f };
        const float radii[] = { 16.0f, 18.0f, 16.0f };
        const float bodyTop[] = { 96.0f, 92.0f, 96.0f };
        const float bodyBot[] = { 196.0f, 204.0f, 196.0f };

        for (int i = 0; i < 3; ++i)
        {
            juce::Path body;
            const auto x = centres[i];
            body.addEllipse (x - radii[i], 52.0f, radii[i] * 2.0f, radii[i] * 2.0f);
            body.startNewSubPath (x, 52.0f + radii[i] * 2.0f);
            body.lineTo (x, bodyTop[i] + 8.0f);
            body.addRoundedRectangle (x - 22.0f, bodyTop[i], 44.0f, bodyBot[i] - bodyTop[i], 16.0f);
            g.strokePath (body, stroke);
        }

        return image;
    }

    juce::String normalised (const juce::String& text)
    {
        return text.toLowerCase();
    }

    juce::Image pickGlyph (const juce::String& instrumentId,
                           const juce::String& displayName,
                           const juce::String& category)
    {
        const auto hay = normalised (instrumentId + " " + displayName + " " + category);
        const auto sheet28 = loadSheet ("sheet-28.png");
        const auto sheet16 = loadSheet ("sheet-16.png");

        const auto from28 = [&sheet28] (int column, int row)
        {
            return cropCell (sheet28, 7, 4, column, row);
        };
        const auto from16 = [&sheet16] (int column, int row)
        {
            return cropCell (sheet16, 4, 4, column, row);
        };

        if (hay.contains ("choir") || hay.contains ("vocal") || hay.contains ("angelic"))
            return choirGlyph();

        if (hay.contains ("violin"))
            return from28 (2, 3);

        if (hay.contains ("cello") || hay.contains ("bass") || hay.contains ("viola")
            || hay.contains ("celestial") || hay.contains ("string"))
        {
            if (hay.contains ("celestial") || hay.contains ("harp"))
            {
                auto harp = from28 (4, 3);
                return harp.isValid() ? harp : from28 (3, 3);
            }

            return from28 (3, 3);
        }

        if (hay.contains ("piano") || hay.contains ("imperial") || hay.contains ("keys")
            || hay.contains ("keyboard"))
        {
            auto grand = from16 (2, 2);

            if (grand.isValid())
                return grand;

            auto keys = from16 (1, 1);
            return keys.isValid() ? keys : from28 (6, 0);
        }

        if (hay.contains ("perc") || hay.contains ("drum") || hay.contains ("timp")
            || hay.contains ("xylo"))
        {
            auto kit = from28 (4, 1);
            return kit.isValid() ? kit : from28 (1, 0);
        }

        if (hay.contains ("harp"))
            return from28 (4, 3);

        if (hay.contains ("flute") || hay.contains ("piccolo"))
            return from28 (3, 2);

        if (hay.contains ("clarinet") || hay.contains ("oboe") || hay.contains ("bassoon"))
            return from28 (4, 2);

        if (hay.contains ("trumpet"))
            return from28 (1, 2);

        if (hay.contains ("trombone"))
            return from28 (5, 2);

        if (hay.contains ("horn"))
            return from28 (6, 2);

        if (hay.contains ("tuba"))
            return from28 (0, 2);

        if (hay.contains ("organ"))
            return from28 (6, 0);

        if (category.containsIgnoreCase ("string"))
            return from28 (2, 3);

        if (category.containsIgnoreCase ("piano") || category.containsIgnoreCase ("key"))
            return from16 (2, 2);

        if (category.containsIgnoreCase ("perc"))
            return from28 (1, 0);

        return from28 (2, 3);
    }
}

juce::Image glyphFor (const juce::String& instrumentId,
                      const juce::String& displayName,
                      const juce::String& category)
{
    auto image = pickGlyph (instrumentId, displayName, category);

    return image;
}
}
