import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { sermons } from "../data/sermons";
import {
  Badge,
  Button,
  Header,
  Page,
  StatePanel,
  T,
  Thumbnail,
  c,
  s,
} from "../ui";
export default function States() {
  const [state, setState] = useState("empty");
  return (
    <Page>
      <Header title="App states" back />
      <Badge>DEMO · PREVIEW CONTROLS</Badge>
      <T style={[s.body, { marginVertical: 20 }]}>
        Preview the moments between messages. These controls simulate a state;
        they do not change your connection.
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["empty", "loading", "offline", "error", "thumbnail"].map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: state === item }}
            key={item}
            onPress={() => setState(item)}
            style={{
              padding: 13,
              borderRadius: 12,
              backgroundColor: state === item ? c.mint : c.surface,
            }}
          >
            <T
              style={{
                color: state === item ? c.ink : c.text,
                textTransform: "capitalize",
              }}
            >
              {item}
            </T>
          </Pressable>
        ))}
      </View>
      {state === "empty" && (
        <StatePanel
          title="Your next message is on its way."
          body="There are no sermons in this view yet. You can still explore the public collection."
          label="Browse sermons"
          action={() => router.push("/")}
        />
      )}{" "}
      {state === "loading" && (
        <View style={{ paddingVertical: 48, gap: 24 }}>
          <ActivityIndicator
            color={c.mint}
            accessibilityLabel="Loading sermons"
          />
          <T>Getting the library ready…</T>
          <Button
            label="Finish loading demo"
            onPress={() => setState("empty")}
          />
        </View>
      )}
      {state === "offline" && (
        <StatePanel
          icon="cloud-offline-outline"
          title="You’re offline"
          body="The catalogue is still here. Connect to the internet to load thumbnails and watch a message."
          label="Retry connection (demo)"
          action={() => setState("loading")}
        />
      )}{" "}
      {state === "error" && (
        <StatePanel
          icon="alert-circle-outline"
          title="The player couldn’t load"
          body="Check your connection and try again. You can also open a message directly on YouTube from its sermon page."
          label="Retry (demo)"
          action={() => setState("loading")}
        />
      )}{" "}
      {state === "thumbnail" && (
        <View style={{ marginTop: 30, gap: 16 }}>
          <Thumbnail sermon={sermons[0]} missing />
          <T style={s.body}>
            When artwork is missing, the message title and Play action still
            work.
          </T>
        </View>
      )}
    </Page>
  );
}
