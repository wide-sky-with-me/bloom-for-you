// Centralized Gift & Keepsake Letter Configuration for 《鸢尾湾·花与海之约》
// Modify the fields below in one place to customize the dedication, salutation,
// letter paragraphs, signature, and commemorative date across both the web project
// and the standalone offline HTML deliverable.

export const GIFT_CONFIG = {
  title: "鸢尾湾·花与海之约",
  subtitle: "海景花墅、莫奈花园与群岛海湾庄园",
  recipient: "我最爱的老婆",
  salutation: "亲爱的老婆：",
  letter: [
    "想送你一束花，又贪心地想让它永远盛开。",
    "于是把一颗颗微小的光，写成了花瓣的模样。你指尖掠过的风，你随手点亮的星光，都是我想给你的浪漫。",
    "谢谢你，把平凡的日子，变成我最喜欢的人间。",
    "往后的每一个春天，都想和你一起看花。\n而每一个没有花的日子，也一样爱你。",
  ],
  signature: "永远偏爱你的，老公",
  date: "花与海之约 · 岁岁常相见",
};

export async function resolveGiftConfig() {
  const inlineOverride =
    typeof window !== "undefined" && window.__INLINE_GIFT_CONFIG__
      ? window.__INLINE_GIFT_CONFIG__
      : null;

  if (inlineOverride) {
    return { ...GIFT_CONFIG, ...inlineOverride };
  }

  if (typeof window !== "undefined" && window.location?.protocol === "file:") {
    return { ...GIFT_CONFIG };
  }

  try {
    const res = await fetch("./gift.json");
    if (!res.ok) return { ...GIFT_CONFIG };
    const json = await res.json();
    return { ...GIFT_CONFIG, ...(json || {}) };
  } catch {
    return { ...GIFT_CONFIG };
  }
}
