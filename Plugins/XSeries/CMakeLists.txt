# TMSS X Series 2.0 — VST3 plugin family.
# See docs/x-series-2.0.md section 4 for the packaging contract.
#
# Configure:
#   cmake -S Plugins/XSeries -B build/xseries -G "Visual Studio 17 2022" -A x64
# Build + install:
#   cmake --build build/xseries --config Release --target XSeriesAll

cmake_minimum_required(VERSION 3.22)

project(TMSS_XSeries VERSION 2.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(X_JUCE_DIR "D:/Visual studio/juce-9.0.1-windows/JUCE"
    CACHE PATH "Root of the JUCE checkout (the folder containing JUCE's own CMakeLists.txt)")
set(X_VST3_INSTALL_DIR "C:/Program Files/Common Files/VST3/TMSS X series"
    CACHE PATH "Where the finished .vst3 bundles are installed")

if (NOT EXISTS "${X_JUCE_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "JUCE not found at '${X_JUCE_DIR}'. Pass -DX_JUCE_DIR=<path to JUCE>.")
endif()

add_subdirectory("${X_JUCE_DIR}" "${CMAKE_BINARY_DIR}/JUCE" EXCLUDE_FROM_ALL)

set(X_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
set(X_DSP_DIR "${X_REPO_ROOT}/Source/Audio")
set(X_SHARED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/Shared")

# The shared editor chrome is compiled into each plugin rather than shipped as a static
# library: JUCE's per-target config header makes a standalone library the more fragile option
# for a family this small.
set(X_SHARED_SOURCES
    "${X_SHARED_DIR}/XTheme.h"
    "${X_SHARED_DIR}/XLookAndFeel.h"
    "${X_SHARED_DIR}/XLookAndFeel.cpp"
    "${X_SHARED_DIR}/XWidgets.h"
    "${X_SHARED_DIR}/XWidgets.cpp"
    "${X_SHARED_DIR}/XEditorBase.h"
    "${X_SHARED_DIR}/XEditorBase.cpp"
    "${X_SHARED_DIR}/XPresets.h")

# Every X-series plugin shares the same host-facing shape, so the differences are
# reduced to name, code, category and sources.
function(x_add_plugin)
    cmake_parse_arguments(ARG "" "TARGET;PRODUCT;CODE;CATEGORY" "SOURCES" ${ARGN})

    juce_add_plugin(${ARG_TARGET}
        COMPANY_NAME "TMSS"
        COMPANY_COPYRIGHT "TMSS"
        BUNDLE_ID "com.tmss.xseries.${ARG_TARGET}"
        PLUGIN_MANUFACTURER_CODE TMSS
        PLUGIN_CODE ${ARG_CODE}
        FORMATS VST3
        PRODUCT_NAME "${ARG_PRODUCT}"
        VST3_CATEGORIES "Fx" "${ARG_CATEGORY}"
        IS_SYNTH FALSE
        NEEDS_MIDI_INPUT FALSE
        NEEDS_MIDI_OUTPUT FALSE
        IS_MIDI_EFFECT FALSE
        EDITOR_WANTS_KEYBOARD_FOCUS FALSE
        COPY_PLUGIN_AFTER_BUILD TRUE
        VST3_COPY_DIR "${X_VST3_INSTALL_DIR}")

    juce_generate_juce_header(${ARG_TARGET})

    target_sources(${ARG_TARGET} PRIVATE ${ARG_SOURCES} ${X_SHARED_SOURCES})

    target_include_directories(${ARG_TARGET} PRIVATE
        "${X_SHARED_DIR}"
        "${X_DSP_DIR}"
        "${X_DSP_DIR}/XSeries")

    target_compile_definitions(${ARG_TARGET} PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
        JUCE_REPORT_APP_USAGE=0
        JUCE_STRICT_REFCOUNTEDPOINTER=1)

    target_link_libraries(${ARG_TARGET} PRIVATE
        juce::juce_audio_basics
        juce::juce_audio_processors
        juce::juce_audio_utils
        juce::juce_core
        juce::juce_data_structures
        juce::juce_events
        juce::juce_graphics
        juce::juce_gui_basics
        juce::juce_gui_extra
        PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)

    if (MSVC)
        # /fp:fast is deliberate: every DSP core flushes denormals itself and none of them
        # rely on strict IEEE ordering. /utf-8 stops MSVC reading the sources through the
        # system code page, which on a zh-CN machine buries the log in C4819.
        target_compile_options(${ARG_TARGET} PUBLIC
            /utf-8
            $<$<CONFIG:Release>:/fp:fast /Oi>
            /wd4244 /wd4267)
    endif()

    set_target_properties(${ARG_TARGET} PROPERTIES FOLDER "XSeries")

    # juce_add_plugin makes ${ARG_TARGET} the shared-code library; the bundle that actually
    # gets built and installed is the per-format target.
    list(APPEND X_ALL_TARGETS ${ARG_TARGET}_VST3)
    set(X_ALL_TARGETS ${X_ALL_TARGETS} PARENT_SCOPE)
endfunction()

# ── Plugins ──────────────────────────────────────────────────────────────────

x_add_plugin(
    TARGET EqualizerX
    PRODUCT "TMSS EQ X"
    CODE TxEQ
    CATEGORY "EQ"
    SOURCES
        "${CMAKE_CURRENT_SOURCE_DIR}/EqualizerX/EqualizerXPlugin.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/EqualizerX/EqualizerXPlugin.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/EqualizerX/EqualizerXEditor.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/EqualizerX/EqualizerXEditor.cpp"
        "${X_DSP_DIR}/XSeries/EqualizerXCore.h"
        "${X_DSP_DIR}/XSeries/EqualizerXCore.cpp"
        "${X_DSP_DIR}/XSeries/XCommon.h")

x_add_plugin(
    TARGET LimiterX
    PRODUCT "TMSS Limiter X"
    CODE TxLM
    CATEGORY "Dynamics"
    SOURCES
        "${CMAKE_CURRENT_SOURCE_DIR}/LimiterX/LimiterXPlugin.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/LimiterX/LimiterXPlugin.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/LimiterX/LimiterXEditor.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/LimiterX/LimiterXEditor.cpp"
        "${X_DSP_DIR}/XSeries/LimiterXCore.h"
        "${X_DSP_DIR}/XSeries/LimiterXCore.cpp")

x_add_plugin(
    TARGET ReverbX
    PRODUCT "TMSS Reverb X"
    CODE TxRV
    CATEGORY "Reverb"
    SOURCES
        "${CMAKE_CURRENT_SOURCE_DIR}/ReverbX/ReverbXPlugin.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/ReverbX/ReverbXPlugin.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/ReverbX/ReverbXEditor.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/ReverbX/ReverbXEditor.cpp"
        "${X_DSP_DIR}/XSeries/ReverbXCore.h"
        "${X_DSP_DIR}/XSeries/ReverbXCore.cpp")

x_add_plugin(
    TARGET DynamicX
    PRODUCT "TMSS Dynamic X"
    CODE TxDY
    CATEGORY "Dynamics"
    SOURCES
        "${CMAKE_CURRENT_SOURCE_DIR}/DynamicX/DynamicXPlugin.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/DynamicX/DynamicXPlugin.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/DynamicX/DynamicXEditor.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/DynamicX/DynamicXEditor.cpp"
        "${X_DSP_DIR}/XSeries/DynamicXCore.h"
        "${X_DSP_DIR}/XSeries/DynamicXCore.cpp")

x_add_plugin(
    TARGET BoostX
    PRODUCT "TMSS Boost X"
    CODE TxBO
    CATEGORY "Distortion"
    SOURCES
        "${CMAKE_CURRENT_SOURCE_DIR}/BoostX/BoostXPlugin.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/BoostX/BoostXPlugin.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/BoostX/BoostXEditor.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/BoostX/BoostXEditor.cpp"
        "${X_DSP_DIR}/XSeries/BoostXCore.h"
        "${X_DSP_DIR}/XSeries/BoostXCore.cpp")

# ── Validator ────────────────────────────────────────────────────────────────
# Stands in for pluginval: scans the installed bundles and exercises each one.

juce_add_console_app(XSeriesValidator PRODUCT_NAME "XSeriesValidator")
juce_generate_juce_header(XSeriesValidator)

target_sources(XSeriesValidator PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/Validator/XSeriesValidator.cpp")

target_compile_definitions(XSeriesValidator PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_VST=0
    JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_STANDALONE_APPLICATION=1)

target_link_libraries(XSeriesValidator PRIVATE
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_audio_formats
    juce::juce_audio_processors
    juce::juce_audio_utils
    juce::juce_core
    juce::juce_data_structures
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_warning_flags)

if (MSVC)
    target_compile_options(XSeriesValidator PRIVATE /utf-8 /wd4244 /wd4267)
endif()

set_target_properties(XSeriesValidator PROPERTIES FOLDER "XSeries")

# ── Aggregate ────────────────────────────────────────────────────────────────
# Installation into X_VST3_INSTALL_DIR is handled by JUCE's own COPY_PLUGIN_AFTER_BUILD
# step on each VST3 target.

add_custom_target(XSeriesAll ALL COMMENT "TMSS X Series 2.0")
add_dependencies(XSeriesAll ${X_ALL_TARGETS})
