import { StatusBar } from "expo-status-bar";
import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { BackHandler, Platform, StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import { c } from "../../theme";
import { web } from "../../ui";

/**
 * Computes the geometry for the video + overlay container when in inline mode
 * vs. full-screen landscape mode.
 *
 * On iPhone and Android (without adding a native orientation module so this
 * ships as an OTA update to build 3), when the device window is in portrait
 * (`height > width`), full screen rotates the stage 90 degrees so the 16:9
 * video fills the screen in landscape with our custom VideoOverlay on top.
 */
export function useStageFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((was) => {
      const next = !was;
      if (Platform.OS === "web" && typeof document !== "undefined") {
        if (!next && document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
      return next;
    });
  }, []);

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    if (Platform.OS === "web" && typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Web Escape key and native Android hardware Back exit full screen first.
  useEffect(() => {
    if (!fullscreen) return;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setFullscreen(false);
      };
      const onFsChange = () => {
        if (!document.fullscreenElement) setFullscreen(false);
      };
      document.addEventListener("keydown", onKey);
      document.addEventListener("fullscreenchange", onFsChange);
      return () => {
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("fullscreenchange", onFsChange);
      };
    }
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setFullscreen(false);
      return true;
    });
    return () => sub.remove();
  }, [fullscreen]);

  return { fullscreen, setFullscreen, toggleFullscreen, exitFullscreen };
}

export type StageVideoFrameProps = {
  fullscreen: boolean;
  /** Inline width (typically edge-to-edge window width). */
  width: number;
  /** Inline 16:9 height (at least 200pt). */
  height: number;
  children: ReactNode;
};

/**
 * Holds the video surface and VideoOverlay. In normal mode it sits edge-to-edge
 * at 16:9; in full-screen mode it expands to a landscape full-screen stage
 * while keeping its children mounted in the same tree position so playback
 * never restarts.
 */
export const StageVideoFrame = memo(function StageVideoFrame({
  fullscreen,
  width,
  height,
  children,
}: StageVideoFrameProps) {
  const window = useWindowDimensions();

  if (!fullscreen) {
    return (
      <View
        style={[styles.inline, { width, height }]}
        testID="stage-video-frame"
      >
        {children}
      </View>
    );
  }

  const portraitOnNative = Platform.OS !== "web" && window.height > window.width;
  const stageW = portraitOnNative ? window.height : window.width;
  const stageH = portraitOnNative ? window.width : window.height;

  const fullscreenOuterStyle: ViewStyle =
    Platform.OS === "web"
      ? ({
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
          backgroundColor: c.black,
          alignItems: "center",
          justifyContent: "center",
        } as unknown as ViewStyle)
      : {
          ...StyleSheet.absoluteFill,
          zIndex: 999,
          backgroundColor: c.black,
          alignItems: "center",
          justifyContent: "center",
        };

  return (
    <View style={{ width, height }}>
      <StatusBar hidden />
      <View
        style={fullscreenOuterStyle}
        testID="stage-video-fullscreen"
        {...web({ role: "dialog", "aria-label": "Full screen video player" })}
      >
        <View
          style={[
            styles.landscapeStage,
            {
              width: stageW,
              height: stageH,
              transform: portraitOnNative ? [{ rotate: "90deg" }] : undefined,
            },
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  inline: {
    backgroundColor: c.black,
    overflow: "hidden",
    position: "relative",
  },
  landscapeStage: {
    backgroundColor: c.black,
    overflow: "hidden",
    position: "relative",
  },
});
