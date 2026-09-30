import Constants from "expo-constants";
import { useMemo } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";
import { PlayerProps } from "./types";
export default function Embed({
  videoId,
  height,
  startSeconds = 0,
  onEvent,
}: PlayerProps) {
  const inExpoGo = Constants.executionEnvironment === "storeClient";
  const appId =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.bundleIdentifier
      : Constants.expoConfig?.android?.package;
  // Expo Go isn't this app's registered identity. Don't forge a borrowed Referer.
  const baseUrl = !inExpoGo && appId ? "https://" + appId + "/" : undefined;
  const source = useMemo(() => {
    const vars = {
      autoplay: 0,
      controls: 1,
      playsinline: 1,
      rel: 0,
      start: startSeconds,
      ...(baseUrl ? { origin: baseUrl.slice(0, -1) } : {}),
    };
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,#player{margin:0;width:100%;height:100%;background:#000}</style></head><body><div id="player"></div><script>
 var p; function send(e){window.ReactNativeWebView.postMessage(JSON.stringify(e))}
 function onYouTubeIframeAPIReady(){p=new YT.Player("player",{videoId:${JSON.stringify(videoId)},width:"100%",height:"100%",playerVars:${JSON.stringify(vars)},events:{onReady:function(){send({type:"ready"})},onError:function(e){send({type:"error",code:e.data})},onStateChange:function(e){send({type:"state",state:e.data,seconds:p.getCurrentTime()})}})}
 setInterval(function(){if(p&&p.getPlayerState()===1)send({type:"state",state:1,seconds:p.getCurrentTime()})},1000);
 </script><script src="https://www.youtube.com/iframe_api" onerror="send({type:'error',code:0})"></script></body></html>`;
    return { html, ...(baseUrl ? { baseUrl } : {}) };
  }, [videoId, startSeconds, baseUrl]);
  return (
    <WebView
      source={source}
      style={{ height, backgroundColor: "#000" }}
      scrollEnabled={false}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (["ready", "state", "error"].includes(data.type)) onEvent(data);
        } catch {
          /* Ignore unrelated messages. */
        }
      }}
      onError={() => onEvent({ type: "error", code: 0 })}
      originWhitelist={["https://*", "about:blank"]}
    />
  );
}
