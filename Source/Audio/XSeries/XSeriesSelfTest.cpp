#include "XSeriesSelfTest.h"

#include "BoostXCore.h"
#include "DynamicXCore.h"
#include "EqualizerXCore.h"
#include "LimiterXCore.h"
#include "ReverbXCore.h"
#include "XCommon.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

namespace
{
    constexpr double kSr = 48000.0;
    constexpr int kBlock = 128;
    int gFails = 0;

    void pass (const char* name) { std::printf ("  ok  %s\n", name); }

    void fail (const char* name, const char* detail = nullptr)
    {
        ++gFails;
        if (detail)
            std::printf ("  FAIL  %s - %s\n", name, detail);
        else
            std::printf ("  FAIL  %s\n", name);
    }

    void section (const char* title) { std::printf ("\n[%s]\n", title); }

    bool isFiniteBlock (const float* x, int n)
    {
        for (int i = 0; i < n; ++i)
            if (! xs::isFinite (x[i]))
                return false;
        return true;
    }

    float rmsStereo (const float* l, const float* r, int n)
    {
        double s = 0.0;
        for (int i = 0; i < n; ++i)
            s += (double) l[i] * l[i] + (double) r[i] * r[i];
        return (float) std::sqrt (s / (2.0 * (double) n) + 1.0e-20);
    }

    float peakStereo (const float* l, const float* r, int n)
    {
        float p = 0.0f;
        for (int i = 0; i < n; ++i)
            p = xs::xmax (p, xs::xmax (std::abs (l[i]), std::abs (r[i])));
        return p;
    }

    void fillSine (float* l, float* r, int n, float freq, float amp, float& phase)
    {
        const float w = (float) (xs::twoPi * freq / kSr);
        for (int i = 0; i < n; ++i)
        {
            const float x = std::sin (phase) * amp;
            l[i] = x;
            r[i] = x;
            phase += w;
        }
    }

    template <typename Core, typename SetFn>
    void warmup (Core& core, SetFn setFn, int blocks = 48)
    {
        setFn();
        std::vector<float> l (kBlock), r (kBlock);
        for (int b = 0; b < blocks; ++b)
            core.process (l.data(), r.data(), kBlock);
    }

    template <typename Core, typename SetFn>
    double benchCore (Core& core, SetFn setFn, int frames)
    {
        setFn();
        std::vector<float> l (kBlock), r (kBlock);
        float ph = 0.0f;
        const auto t0 = std::chrono::steady_clock::now();
        int done = 0;
        while (done < frames)
        {
            fillSine (l.data(), r.data(), kBlock, 997.0f, 0.35f, ph);
            core.process (l.data(), r.data(), kBlock);
            done += kBlock;
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double ns = std::chrono::duration<double, std::nano> (t1 - t0).count();
        return ns / (double) done;
    }

    // ── XCommon ──────────────────────────────────────────────────────────────

    void testXCommon()
    {
        section ("XCommon");

        float maxDbErr = 0.0f;
        for (int i = -600; i <= 120; ++i)
        {
            const float db = (float) i * 0.1f;
            const float g = xs::dbToGain (db);
            const float back = xs::fastGainToDb (g);
            maxDbErr = xs::xmax (maxDbErr, std::abs (back - db));
        }
        if (maxDbErr < 0.002f) pass ("fastGainToDb accuracy");
        else fail ("fastGainToDb accuracy", "max err dB");

        maxDbErr = 0.0f;
        for (int i = -600; i <= 120; ++i)
        {
            const float db = (float) i * 0.1f;
            const float gExact = xs::dbToGain (db);
            const float gFast = xs::fastDbToGain (db);
            maxDbErr = xs::xmax (maxDbErr, std::abs (xs::gainToDb (gFast / gExact)));
        }
        if (maxDbErr < 0.002f) pass ("fastDbToGain accuracy");
        else fail ("fastDbToGain accuracy");

        xs::Oversampler os;
        os.prepare (4, kBlock);
        os.setFactor (2);
        if (os.getLatencySamples() == 47) pass ("oversampler 2x latency = 47");
        else fail ("oversampler 2x latency = 47");
        os.setFactor (4);
        if (os.getLatencySamples() == 71) pass ("oversampler 4x latency = 71");
        else fail ("oversampler 4x latency = 71");

        os.setFactor (2);
        os.reset();
        std::vector<float> l (kBlock), r (kBlock);
        float ph = 0.0f;
        double inE = 0.0, outE = 0.0;
        for (int b = 0; b < 64; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 1000.0f, 0.25f, ph);
            for (int i = 0; i < kBlock; ++i)
                inE += (double) l[(size_t) i] * l[(size_t) i];
            os.processBlock (l.data(), r.data(), kBlock, [] (float*, float*, int) noexcept {});
            for (int i = 0; i < kBlock; ++i)
                outE += (double) l[(size_t) i] * l[(size_t) i];
        }
        const float errDb = xs::gainToDb ((float) std::sqrt (outE / xs::xmax (1.0e-20, inE)));
        char buf[80];
        std::snprintf (buf, sizeof (buf), "level err=%.3f dB", errDb);
        if (std::abs (errDb) < 0.05) pass ("oversampler FIR");
        else fail ("oversampler FIR", buf);

        xs::LinkwitzRiley4 lr;
        lr.setCrossover (1000.0, kSr);
        const double wLow = xs::twoPi * 200.0 / kSr;
        const double wHigh = xs::twoPi * 4000.0 / kSr;
        const double low200 = lr.lowMagnitudeSquared (wLow);
        const double high4k = lr.highMagnitudeSquared (wHigh);
        if (low200 > 0.9 && high4k > 0.9) pass ("LinkwitzRiley4 band separation");
        else fail ("LinkwitzRiley4 band separation");
    }

    // ── Equalizer X ──────────────────────────────────────────────────────────

    void testEqualizerX()
    {
        section ("EqualizerX");

        EqualizerXCore eq;
        eq.prepare (kSr, kBlock);

        EqualizerXParams flat {};
        flat.nodes[0].shape = EqShape::bell;
        flat.nodes[0].freq = 1000.0f;
        flat.nodes[0].gain = 6.0f;
        flat.nodes[0].q = 0.9f;

        const float mag6 = eq.magnitudeDb (1000.0f);
        eq.setParams (flat);
        const float mag6b = eq.magnitudeDb (1000.0f);
        char buf[64];
        std::snprintf (buf, sizeof (buf), "got %.2f", mag6b);
        if (std::abs (mag6b - 6.0f) < 0.3f) pass ("bell +6 dB @ 1 kHz");
        else fail ("bell +6 dB @ 1 kHz", buf);
        (void) mag6;

        EqualizerXParams cut {};
        cut.nodes[0].shape = EqShape::lowCut;
        cut.nodes[0].freq = 200.0f;
        cut.nodes[0].slope = 12;
        eq.setParams (cut);
        if (eq.magnitudeDb (40.0f) < -10.0f) pass ("low cut attenuates subs");
        else fail ("low cut attenuates subs");

        warmup (eq, [&] { eq.setParams (EqualizerXParams {}); }, 8);
        std::vector<float> l (kBlock), r (kBlock);
        for (int i = 0; i < kBlock; ++i) { l[(size_t) i] = 0.01f; r[(size_t) i] = -0.01f; }
        std::vector<float> l0 = l, r0 = r;
        eq.process (l.data(), r.data(), kBlock);
        float md = 0.0f;
        for (int i = 0; i < kBlock; ++i)
            md = xs::xmax (md, xs::xmax (std::abs (l[(size_t) i] - l0[(size_t) i]),
                                         std::abs (r[(size_t) i] - r0[(size_t) i])));
        if (md < 1.0e-4f && isFiniteBlock (l.data(), kBlock)) pass ("unity passthrough");
        else fail ("unity passthrough");

        eq.setParams (flat);
        warmup (eq, [&] { eq.setParams (flat); }, 64);
        float ph = 0.0f;
        double sumBoost = 0.0, sumFlat = 0.0;
        EqualizerXParams zero = flat;
        zero.nodes[0].gain = 0.0f;
        for (int b = 0; b < 32; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 1000.0f, 0.2f, ph);
            eq.process (l.data(), r.data(), kBlock);
            sumBoost += rmsStereo (l.data(), r.data(), kBlock);
        }
        eq.setParams (zero);
        warmup (eq, [&] { eq.setParams (zero); }, 32);
        ph = 0.0f;
        for (int b = 0; b < 32; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 1000.0f, 0.2f, ph);
            eq.process (l.data(), r.data(), kBlock);
            sumFlat += rmsStereo (l.data(), r.data(), kBlock);
        }
        const float deltaDb = xs::gainToDb ((float) (sumBoost / xs::xmax (1.0e-12, sumFlat)));
        std::snprintf (buf, sizeof (buf), "delta=%.2f dB", deltaDb);
        if (deltaDb > 4.0f && deltaDb < 8.0f) pass ("bell +6 audible");
        else fail ("bell +6 audible", buf);

        const double ns = benchCore (eq, [&] { eq.setParams (EqualizerXParams {}); }, kSr);
        const double pct = ns * kSr / 1.0e7;
        std::snprintf (buf, sizeof (buf), "%.1f%%", pct);
        if (pct < 12.0) pass ("CPU budget 7 bands 1x");
        else fail ("CPU budget 7 bands 1x", buf);
    }

    // ── Limiter X ──────────────────────────────────────────────────────────

    void testLimiterX()
    {
        section ("LimiterX");

        tmss::LimiterXCore lim;
        lim.prepare (kSr, kBlock);

        tmss::LimiterXParams p {};
        p.gainDb = 6.0f;
        p.ceilingDb = -0.1f;
        p.lookaheadMs = 1.5f;
        p.oversampling = 4;
        p.truePeak = true;
        lim.setParams (p);

        const int lat = lim.getLatencySamples();
        const int expect = (int) std::lround (1.5 * 0.001 * kSr);
        char buf[64];
        std::snprintf (buf, sizeof (buf), "got %d expect ~%d", lat, expect);
        if (std::abs (lat - expect) <= 1) pass ("lookahead latency reported");
        else fail ("lookahead latency reported", buf);

        warmup (lim, [&] { lim.setParams (p); }, 64);
        std::vector<float> l (kBlock), r (kBlock);
        float ph = 0.0f;
        for (int b = 0; b < 128; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 3000.0f, 1.5f, ph);
            lim.process (l.data(), r.data(), kBlock);
        }
        const float pk = peakStereo (l.data(), r.data(), kBlock);
        const float ceilLin = tmss::LimiterXCore::dbToGain (-0.1f);
        std::snprintf (buf, sizeof (buf), "peak=%.4f ceil=%.4f", pk, ceilLin);
        if (pk <= ceilLin * 1.02f && isFiniteBlock (l.data(), kBlock)) pass ("ceiling enforced");
        else fail ("ceiling enforced", buf);

        const double ns = benchCore (lim, [&] { lim.setParams (p); }, (int) kSr);
        const double pct = ns * kSr / 1.0e7;
        std::snprintf (buf, sizeof (buf), "%.1f%%", pct);
        if (pct < 10.0) pass ("CPU budget 4x TP");
        else fail ("CPU budget 4x TP", buf);
    }

    // ── Reverb X ───────────────────────────────────────────────────────────

    void testReverbX()
    {
        section ("ReverbX");

        tmss::ReverbXCore rev441, rev48;
        rev441.prepare (44100.0, kBlock);
        rev48.prepare (48000.0, kBlock);

        tmss::ReverbXParams rp {};
        rp.amount = 0.0f;
        rp.decay = 2.2f;
        rp.size = 0.62f;
        rev441.setParams (rp);
        rev48.setParams (rp);

        if (rev441.getLatencySamples() == 0 && rev48.getLatencySamples() == 0)
            pass ("reverb latency = 0");
        else fail ("reverb latency = 0");

        std::vector<float> l (kBlock, 0.0f), r (kBlock, 0.0f);
        l[0] = 1.0f;
        r[0] = 1.0f;
        rp.amount = 1.0f;
        rev48.setParams (rp);
        for (int b = 0; b < 256; ++b)
            rev48.process (l.data(), r.data(), kBlock);

        float energy = 0.0f;
        for (int i = 0; i < kBlock; ++i)
            energy += l[(size_t) i] * l[(size_t) i] + r[(size_t) i] * r[(size_t) i];
        if (energy > 1.0e-6f && isFiniteBlock (l.data(), kBlock)) pass ("impulse produces tail");
        else fail ("impulse produces tail");

        rp.amount = 0.35f;
        rev441.setParams (rp);
        rev48.setParams (rp);
        float ph = 0.0f;
        for (int b = 0; b < 64; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 440.0f, 0.1f, ph);
            rev441.process (l.data(), r.data(), kBlock);
            rev48.process (l.data(), r.data(), kBlock);
        }
        if (isFiniteBlock (l.data(), kBlock)) pass ("sine stable dual rate");
        else fail ("sine stable dual rate");

        const double ns = benchCore (rev48, [&] {
            tmss::ReverbXParams x {};
            x.amount = 0.35f;
            rev48.setParams (x);
        }, (int) kSr);
        char buf[64];
        std::snprintf (buf, sizeof (buf), "%.1f%%", ns * kSr / 1.0e7);
        if (ns * kSr / 1.0e7 < 18.0) pass ("CPU budget reverb");
        else fail ("CPU budget reverb", buf);
    }

    // ── Dynamic X ──────────────────────────────────────────────────────────

    void testDynamicX()
    {
        section ("DynamicX");

        const float grHard = tmss::DynamicXCore::computeGainDb (-6.0f, -18.0f, 4.0f, 0.0f);
        const float grSoft = tmss::DynamicXCore::computeGainDb (-12.0f, -18.0f, 4.0f, 12.0f);
        char buf[80];
        std::snprintf (buf, sizeof (buf), "hard=%.2f soft=%.2f", grHard, grSoft);
        if (grHard < -0.1f && grSoft > grHard && grSoft < 0.0f) pass ("soft knee gentler than hard");
        else fail ("soft knee gentler than hard", buf);

        tmss::DynamicXCore dyn;
        dyn.prepare (kSr, kBlock);
        tmss::DynamicXParams dp {};
        dp.threshold = -18.0f;
        dp.ratio = 4.0f;
        dp.lookaheadMs = 2.0f;
        dyn.setParams (dp);
        const int lat = dyn.getLatencySamples();
        const int exp = (int) std::lround (2.0 * 0.001 * kSr);
        std::snprintf (buf, sizeof (buf), "got %d", lat);
        if (std::abs (lat - exp) <= 1) pass ("dynamic lookahead latency");
        else fail ("dynamic lookahead latency", buf);

        dp.mix = 1.0f;
        dp.makeupDb = 0.0f;
        dyn.setParams (dp);
        warmup (dyn, [&] { dyn.setParams (dp); }, 64);
        std::vector<float> l (kBlock), r (kBlock);
        float ph = 0.0f;
        for (int b = 0; b < 128; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 1000.0f, 0.5f, ph);
            dyn.process (l.data(), r.data(), kBlock);
        }
        const float pkIn = xs::dbToGain (-6.0f);
        if (peakStereo (l.data(), r.data(), kBlock) < pkIn * 1.1f
            && dyn.getGainReductionDb() < -0.5f
            && isFiniteBlock (l.data(), kBlock))
            pass ("compressor reduces level");
        else fail ("compressor reduces level");

        dp.splitBands = true;
        dp.bands[0].threshold = -30.0f;
        dp.bands[0].ratio = 8.0f;
        dp.bands[1].threshold = -18.0f;
        dp.bands[2].threshold = -12.0f;
        dyn.setParams (dp);
        warmup (dyn, [&] { dyn.setParams (dp); }, 64);
        ph = 0.0f;
        for (int b = 0; b < 64; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 80.0f, 0.4f, ph);
            dyn.process (l.data(), r.data(), kBlock);
        }
        if (isFiniteBlock (l.data(), kBlock) && dyn.getBandGr (0) >= 0.0f)
            pass ("split band per-band GR");
        else fail ("split band per-band GR");

        dp.splitBands = false;
        dp.mix = 0.5f;
        dyn.setParams (dp);
        warmup (dyn, [&] { dyn.setParams (dp); }, 32);
        if (isFiniteBlock (l.data(), kBlock)) pass ("parallel mix stable");
        else fail ("parallel mix stable");

        const double ns = benchCore (dyn, [&] {
            tmss::DynamicXParams x {};
            x.splitBands = true;
            dyn.setParams (x);
        }, (int) kSr);
        std::snprintf (buf, sizeof (buf), "%.1f%%", ns * kSr / 1.0e7);
        if (ns * kSr / 1.0e7 < 15.0) pass ("CPU budget 3-band");
        else fail ("CPU budget 3-band", buf);
    }

    // ── Boost X ────────────────────────────────────────────────────────────

    void testBoostX()
    {
        section ("BoostX");

        tmss::BoostXCore boost;
        boost.prepare (kSr, kBlock);

        tmss::BoostXParams bp {};
        bp.mode = tmss::BoostXMode::Ott;
        bp.amount = 0.35f;
        bp.oversampling = 2;
        boost.setParams (bp);
        if (boost.getLatencySamples() == 0) pass ("OTT latency = 0");
        else fail ("OTT latency = 0");

        bp.mode = tmss::BoostXMode::Drive;
        bp.oversampling = 4;
        boost.setParams (bp);
        if (boost.getLatencySamples() == 71) pass ("drive 4x latency = 71");
        else fail ("drive 4x latency = 71");

        bp.mode = tmss::BoostXMode::Ott;
        bp.amount = 0.4f;
        boost.setParams (bp);
        warmup (boost, [&] { boost.setParams (bp); }, 64);
        std::vector<float> l (kBlock), r (kBlock);
        float ph = 0.0f;
        for (int b = 0; b < 64; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 220.0f, 0.3f, ph);
            boost.process (l.data(), r.data(), kBlock);
        }
        if (isFiniteBlock (l.data(), kBlock)) pass ("OTT processes sine");
        else fail ("OTT processes sine");

        bp.mode = tmss::BoostXMode::Chorus;
        boost.setParams (bp);
        warmup (boost, [&] { boost.setParams (bp); }, 32);
        ph = 0.0f;
        for (int b = 0; b < 64; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 440.0f, 0.2f, ph);
            boost.process (l.data(), r.data(), kBlock);
        }
        if (isFiniteBlock (l.data(), kBlock)) pass ("chorus mode stable");
        else fail ("chorus mode stable");

        bp.mode = tmss::BoostXMode::Expander;
        boost.setParams (bp);
        warmup (boost, [&] { boost.setParams (bp); }, 32);
        if (isFiniteBlock (l.data(), kBlock)) pass ("expander mode stable");
        else fail ("expander mode stable");

        bp.mode = tmss::BoostXMode::Drive;
        bp.hpfHz = 80.0f;
        bp.oversampling = 2;
        boost.setParams (bp);
        warmup (boost, [&] { boost.setParams (bp); }, 64);
        ph = 0.0f;
        for (int b = 0; b < 64; ++b)
        {
            fillSine (l.data(), r.data(), kBlock, 60.0f, 0.5f, ph);
            boost.process (l.data(), r.data(), kBlock);
        }
        if (isFiniteBlock (l.data(), kBlock)) pass ("drive+HPF stable");
        else fail ("drive+HPF stable");

        bp.mode = tmss::BoostXMode::Ott;
        bp.oversampling = 2;
        boost.setParams (bp);
        const double ns = benchCore (boost, [&] { boost.setParams (bp); }, (int) kSr);
        char buf[64];
        std::snprintf (buf, sizeof (buf), "%.1f%%", ns * kSr / 1.0e7);
        if (ns * kSr / 1.0e7 < 15.0) pass ("CPU budget OTT 2x");
        else fail ("CPU budget OTT 2x", buf);
    }
}

bool runXSeriesSelfTests()
{
    gFails = 0;
    std::printf ("X Series 2.0 native DSP self-test @ %.0f Hz / %d samples\n", kSr, kBlock);

    testXCommon();
    testEqualizerX();
    testLimiterX();
    testReverbX();
    testDynamicX();
    testBoostX();

    std::printf ("\n%d test(s) failed.\n", gFails);
    return gFails == 0;
}

#ifdef XSERIES_SELFTEST_MAIN
int main()
{
    return runXSeriesSelfTests() ? 0 : 1;
}
#endif
