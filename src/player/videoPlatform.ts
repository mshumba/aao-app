import { Platform } from "react-native";

/**
 * The phone apps play sermons from R2 in their own video player, and list
 * only sermons whose video is there; the web keeps the YouTube embed and
 * lists everything (media.ts).
 */
export const NATIVE_VIDEO = Platform.OS !== "web";
