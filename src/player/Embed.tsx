import Constants from "expo-constants";
import { useImperativeHandle, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";
import { PLAYER_STOPPED, PlayerProps } from "./types";
export default function Embed({
  videoId,
  height,
  startSeconds = 0,
  onEvent,
  ref,
}: PlayerProps) {
  const webview = useRef<WebView>(null);
  // App controls reach the provider's own player through its official API.
  useImperativeHandle(ref, () => ({
    command: (command) =>
      webview.current?.injectJavaScript(
        `window.__aao&&window.__aao(${JSON.stringify(command)});true;`,
      ),
  }));
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
      controls: 0,
      playsinline: 1,
      rel: 0,
      // Captions are off unless the viewer turns them on in the player
      // (owner, 16 Oct 2026); switched off again as it readies and first plays.
      cc_load_policy: 0,
      start: startSeconds,
      ...(baseUrl ? { origin: baseUrl.slice(0, -1) } : {}),
    };
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,#player{margin:0;width:100%;height:100%;background:#000}</style></head><body><div id="player"></div><script>
 var p, ready=false, ccChecked=false, ccWanted=false, ccTimer; function send(e){window.ReactNativeWebView.postMessage(JSON.stringify(e))}
 function ccOff(){try{p.setOption&&p.setOption("captions","track",{});p.unloadModule("captions");p.unloadModule("cc")}catch(e){}}
 function reportCc(){try{var on=ccWanted;if(on&&typeof p.getOption==="function"){var t=p.getOption("captions","track");if(t&&typeof t==="object")on=!!t.languageCode}send({type:"captions",enabled:on})}catch(e){}}
 function dur(){try{return p.getDuration()}catch(e){return 0}}
 window.__aao=function(c){if(!ready)return;if(c.type==="play")p.playVideo();else if(c.type==="pause")p.pauseVideo();else if(c.type==="seek")p.seekTo(c.seconds,true);else if(c.type==="rate")p.setPlaybackRate(c.rate);else if(c.type==="captions"){ccWanted=!!c.enabled;clearTimeout(ccTimer);try{if(c.enabled){p.loadModule&&p.loadModule("captions");p.setOption&&p.setOption("captions","track",{languageCode:"en"})}else{ccOff()}}catch(_){}ccTimer=setTimeout(reportCc,500)}};
 function onYouTubeIframeAPIReady(){p=new YT.Player("player",{videoId:${JSON.stringify(videoId)},width:"100%",height:"100%",playerVars:${JSON.stringify(vars)},events:{onReady:function(){ready=true;if(!ccWanted)ccOff();send({type:"ready",duration:dur()})},onApiChange:function(){if(!ccWanted){ccOff();send({type:"captions",enabled:false})}else{try{p.setOption&&p.setOption("captions","track",{languageCode:"en"})}catch(e){}clearTimeout(ccTimer);ccTimer=setTimeout(reportCc,500)}},onError:function(e){send({type:"error",code:e.data})},onStateChange:function(e){if(e.data===1&&!ccChecked){ccChecked=true;if(!ccWanted)ccOff()}send({type:"state",state:e.data,seconds:p.getCurrentTime(),duration:dur()})},onPlaybackRateChange:function(e){send({type:"rate",rate:e.data})}}})}
 setInterval(function(){if(ready&&p.getPlayerState()===1)send({type:"state",state:1,seconds:p.getCurrentTime(),duration:dur()})},1000);
 </script><script src="https://www.youtube.com/iframe_api" onerror="send({type:'error',code:0})"></script></body></html>`;
    return { html, ...(baseUrl ? { baseUrl } : {}) };
  }, [videoId, startSeconds, baseUrl]);
  return (
    <WebView
      ref={webview}
      source={source}
      style={{ height, backgroundColor: "#000" }}
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      // Playback only ever starts from the viewer's own tap (Watch or Play in
      // the app); the app's Play control must be able to start the provider.
      mediaPlaybackRequiresUserAction={false}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (["ready", "state", "rate", "captions", "error"].includes(data.type))
            onEvent(data);
        } catch {
          /* Ignore unrelated messages. */
        }
      }}
      onError={() => onEvent({ type: "error", code: 0 })}
      // The system can shut down a web view's page while the app is in the
      // background. Offer Try again rather than leave a dead black player.
      onContentProcessDidTerminate={() =>
        onEvent({ type: "error", code: PLAYER_STOPPED })
      }
      onRenderProcessGone={() =>
        onEvent({ type: "error", code: PLAYER_STOPPED })
      }
      originWhitelist={["https://*", "about:blank"]}
    />
  );
}
