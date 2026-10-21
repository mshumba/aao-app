import Constants from "expo-constants";
import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Linking, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { PLAYER_STOPPED, PlayerEvent, PlayerProps, YOUTUBE_CHECK } from "./types";
import { embedNavigation, startWatch, youtubeErrorCode } from "./youtube";

/**
 * YouTube's player in a web view: on a phone, the fallback for sermons the
 * app's own player can't play (not on R2 yet, or it failed; PlayerProvider
 * chooses). The web view stays on the player (embedNavigation), so a link in
 * it, such as the "Sign in" of YouTube's "confirm you're not a bot" check,
 * never opens Google's sign-in inside the app. When YouTube won't play here
 * (that check, a refusal or no start within 10 seconds of Play), it reports
 * YOUTUBE_CHECK, and the app offers Watch on YouTube and Try again.
 */
export default function Embed({
  videoId,
  height,
  startSeconds = 0,
  onEvent,
  ref,
}: PlayerProps) {
  const webview = useRef<WebView>(null);
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  }, [onEvent]);
  // Once it has played, a sign-in link is only YouTube's own menu, not its check.
  const played = useRef(false);
  // Whether YouTube starts once it's asked to play.
  const watch = useRef<ReturnType<typeof startWatch> | null>(null);
  useEffect(() => {
    const next = startWatch(() => callback.current({ type: "error", code: YOUTUBE_CHECK }));
    watch.current = next;
    return () => {
      next.stop();
      watch.current = null;
    };
  }, []);
  // App controls reach the provider's own player through its official API.
  useImperativeHandle(ref, () => ({
    command: (command) => {
      watch.current?.command(command);
      webview.current?.injectJavaScript(
        `window.__aao&&window.__aao(${JSON.stringify(command)});true;`,
      );
    },
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
        let data: PlayerEvent;
        try {
          data = JSON.parse(e.nativeEvent.data);
        } catch {
          return; // Not one of ours.
        }
        if (data.type === "state") {
          if (data.state === 1) played.current = true;
          watch.current?.state(data.state);
        }
        if (data.type === "error") {
          watch.current?.stop();
          onEvent({ type: "error", code: youtubeErrorCode(data.code) });
        } else if (["ready", "state", "rate", "captions"].includes(data.type)) onEvent(data);
      }}
      // Only the player's own loads; never Google's sign-in or any other
      // page in the player. A YouTube link the viewer taps opens outside.
      onShouldStartLoadWithRequest={(request) => {
        const next = embedNavigation(request, {
          page: baseUrl,
          framesKnown: Platform.OS === "ios",
        });
        if (next === "open") Linking.openURL(request.url).catch(() => {});
        else if (next === "signin" && !played.current) {
          watch.current?.stop();
          onEvent({ type: "error", code: YOUTUBE_CHECK });
        }
        return next === "allow";
      }}
      // Android: a link that asks for a new window loads here instead, where
      // the check above decides; iOS asks it of every new window itself.
      setSupportMultipleWindows={false}
      onError={() => {
        watch.current?.stop();
        onEvent({ type: "error", code: 0 });
      }}
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
