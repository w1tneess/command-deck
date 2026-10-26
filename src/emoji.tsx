import { useId, useState, type ReactNode } from "react";

/**
 * Apple iOS Emoji System
 * Powered by high-resolution Apple iOS emoji assets (from the 3,900+ Apple iOS Emoji Mega Pack).
 * Renders consistent, crisp, glossy Apple emojis across all devices (Windows, Android, macOS, iOS, Linux).
 */

/**
 * Returns the optimized CDN URL for an Apple iOS emoji.
 * Uses emojicdn.elk.sh with Apple style as primary edge-cached delivery.
 */
export function getAppleEmojiUrl(emoji: string): string {
  // Normalize emoji character string for URL encoding
  return `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=apple`;
}

export type AppleEmojiProps = {
  emoji: string;
  size?: number | string;
  className?: string;
  inline?: boolean;
  alt?: string;
  title?: string;
};

/**
 * Renders an authentic Apple iOS emoji from the Apple Emoji Mega Pack.
 * Includes graceful fallback to native font if network fails or while offline.
 */
export function AppleEmoji({
  emoji,
  size = 18,
  className = "",
  inline = true,
  alt,
  title,
}: AppleEmojiProps) {
  const [hasError, setHasError] = useState(false);

  if (!emoji) return null;

  const pxSize = typeof size === "number" ? size : undefined;
  const styleSize = typeof size === "number" ? `${size}px` : size;

  if (hasError) {
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : "true"}
        title={title}
        className={`select-none inline-block ${className}`}
        style={{ fontSize: styleSize, lineHeight: 1 }}
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={getAppleEmojiUrl(emoji)}
      alt={alt || ""}
      aria-hidden={alt ? undefined : "true"}
      title={title}
      width={pxSize}
      height={pxSize}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setHasError(true)}
      className={`${
        inline ? "inline-block align-[-0.18em]" : "block"
      } object-contain select-none shrink-0 pointer-events-none transition-transform duration-150 ${className}`}
      style={{
        width: styleSize,
        height: styleSize,
      }}
    />
  );
}

/** Regex matching all Unicode emoji sequences and presentation characters */
const EMOJI_REGEX = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/gu;

/**
 * Parses any text string and renders any embedded emojis as Apple iOS emojis.
 */
export function AppleText({
  text,
  size = 16,
  className = "",
}: {
  text: string;
  size?: number;
  className?: string;
}) {
  if (!text) return null;

  const parts: (string | ReactNode)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  EMOJI_REGEX.lastIndex = 0;
  while ((match = EMOJI_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const emojiChar = match[0];
    parts.push(
      <AppleEmoji
        key={`${match.index}-${emojiChar}`}
        emoji={emojiChar}
        size={size}
      />
    );
    lastIndex = EMOJI_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}

/**
 * Curated Apple iOS Emoji Mega Pack Categories
 * Extracted from the Figma 3,900+ Apple iOS Emojis Community Pack.
 */
export const APPLE_EMOJI_MEGA_PACK = [
  {
    id: "study",
    label: "Study & Exam",
    icon: "📚",
    emojis: [
      { emoji: "📚", name: "books", keywords: "study reading chapters" },
      { emoji: "📖", name: "open book", keywords: "read syllabus" },
      { emoji: "🎓", name: "graduation cap", keywords: "degree cbse exam pass" },
      { emoji: "📝", name: "memo", keywords: "notes scratchpad revision" },
      { emoji: "✏️", name: "pencil", keywords: "writing homework" },
      { emoji: "🧠", name: "brain", keywords: "memory revision concept mind" },
      { emoji: "🔬", name: "microscope", keywords: "science biology practical" },
      { emoji: "⚛️", name: "atom", keywords: "physics chemistry science" },
      { emoji: "📐", name: "triangular ruler", keywords: "geometry maths" },
      { emoji: "📊", name: "chart", keywords: "stats progress analytics" },
      { emoji: "💻", name: "laptop", keywords: "computer coding class" },
      { emoji: "🎒", name: "backpack", keywords: "school prep" },
      { emoji: "🏫", name: "school", keywords: "class education campus" },
      { emoji: "🏆", name: "trophy", keywords: "winner rank top 100" },
      { emoji: "🎯", name: "bullseye", keywords: "target goal aim focus" },
      { emoji: "⏱️", name: "stopwatch", keywords: "timer pomodoro track" },
      { emoji: "📅", name: "calendar", keywords: "schedule date exam" },
      { emoji: "💡", name: "light bulb", keywords: "idea concept insight" },
      { emoji: "📌", name: "pushpin", keywords: "pin important priority" },
      { emoji: "🗂️", name: "dividers", keywords: "subject folder organizing" },
    ],
  },
  {
    id: "focus",
    label: "Focus & Energy",
    icon: "⚡",
    emojis: [
      { emoji: "⚡", name: "lightning", keywords: "voltage power fast quick urgent" },
      { emoji: "🔥", name: "fire", keywords: "streak hot consistent grind" },
      { emoji: "✨", name: "sparkles", keywords: "clean fresh magic wins" },
      { emoji: "🚀", name: "rocket", keywords: "launch speed productivity" },
      { emoji: "⭐", name: "star", keywords: "favorite star priority" },
      { emoji: "🌟", name: "glowing star", keywords: "highlight success" },
      { emoji: "💎", name: "gem", keywords: "rare high yield important" },
      { emoji: "🔋", name: "battery", keywords: "energy full power charge" },
      { emoji: "💪", name: "flexed biceps", keywords: "strength grit effort" },
      { emoji: "🥇", name: "1st medal", keywords: "gold top best achievement" },
      { emoji: "💯", name: "100", keywords: "perfect full marks complete" },
      { emoji: "🚩", name: "flag", keywords: "milestone checkpoint goal" },
      { emoji: "🔔", name: "bell", keywords: "reminder notify alert" },
      { emoji: "🚨", name: "siren", keywords: "emergency deadline critical" },
      { emoji: "⏳", name: "hourglass", keywords: "countdown time passing" },
    ],
  },
  {
    id: "routine",
    label: "Wellness & Life",
    icon: "🧘",
    emojis: [
      { emoji: "🌅", name: "sunrise", keywords: "morning kickoff dawn start" },
      { emoji: "☀️", name: "sun", keywords: "daylight bright daytime" },
      { emoji: "🌙", name: "crescent moon", keywords: "night evening winddown sleep" },
      { emoji: "☕", name: "coffee", keywords: "caffeine break morning drink" },
      { emoji: "🍵", name: "green tea", keywords: "calm tea warm sip" },
      { emoji: "💧", name: "water droplet", keywords: "hydrate water habit glass" },
      { emoji: "🍎", name: "apple", keywords: "health nutrition fruit food" },
      { emoji: "🧘", name: "meditation", keywords: "zen breath calm breathe mind" },
      { emoji: "🚶", name: "walking", keywords: "walk step stroll break stretch" },
      { emoji: "🏃", name: "running", keywords: "cardio exercise workout" },
      { emoji: "🛌", name: "bed", keywords: "sleep rest nap recharge" },
      { emoji: "😴", name: "sleeping face", keywords: "tired sleep bedtime" },
      { emoji: "❤️", name: "heart", keywords: "love care self health" },
      { emoji: "🌿", name: "herb", keywords: "nature organic plant green" },
      { emoji: "🌱", name: "seedling", keywords: "growth progress beginning" },
      { emoji: "🪴", name: "potted plant", keywords: "calm desk life" },
    ],
  },
  {
    id: "smileys",
    label: "Smileys & Mood",
    icon: "😀",
    emojis: [
      { emoji: "😊", name: "smiling", keywords: "happy good glad pleasant" },
      { emoji: "😎", name: "sunglasses", keywords: "cool confident easy done" },
      { emoji: "🤓", name: "nerd", keywords: "study smart geek book" },
      { emoji: "🤔", name: "thinking", keywords: "doubt question wondering" },
      { emoji: "🤯", name: "exploding head", keywords: "mind blown tough hard" },
      { emoji: "🥳", name: "partying", keywords: "celebrate finished target" },
      { emoji: "😌", name: "relieved", keywords: "peace calm relaxed done" },
      { emoji: "🤩", name: "star-struck", keywords: "excited amazing high" },
      { emoji: "🥱", name: "yawning", keywords: "tired exhausted sleepy" },
      { emoji: "🫠", name: "melting", keywords: "overwhelmed tough heat" },
      { emoji: "👏", name: "clapping", keywords: "bravo good job win" },
      { emoji: "🙌", name: "raising hands", keywords: "hooray praise celebration" },
      { emoji: "👀", name: "eyes", keywords: "look observe review inspect" },
      { emoji: "🤝", name: "handshake", keywords: "deal committed agreement" },
    ],
  },
  {
    id: "activities",
    label: "Creativity & Play",
    icon: "🎨",
    emojis: [
      { emoji: "🎨", name: "artist palette", keywords: "art design drawing creative" },
      { emoji: "🎵", name: "musical note", keywords: "music song tune melody" },
      { emoji: "🎧", name: "headphones", keywords: "lofi audio ambient beats" },
      { emoji: "🎮", name: "video game", keywords: "gaming play relax fun" },
      { emoji: "♟️", name: "chess pawn", keywords: "strategy tactics chess" },
      { emoji: "⚽", name: "soccer", keywords: "football sport play" },
      { emoji: "🏀", name: "basketball", keywords: "sport hoop outdoor" },
      { emoji: "🏸", name: "badminton", keywords: "racket shuttle sport" },
      { emoji: "🧗", name: "climbing", keywords: "adventure rock climb uphill" },
      { emoji: "🚴", name: "biking", keywords: "cycling bike outdoor" },
      { emoji: "🎬", name: "clapper board", keywords: "movie video break watch" },
    ],
  },
  {
    id: "tools",
    label: "Tools & Status",
    icon: "📋",
    emojis: [
      { emoji: "📋", name: "clipboard", keywords: "checklist tasks to-do deliverables" },
      { emoji: "📁", name: "folder", keywords: "directory subject files" },
      { emoji: "🔒", name: "lock", keywords: "secure private pin secret" },
      { emoji: "🔑", name: "key", keywords: "access unlock solution" },
      { emoji: "🏷️", name: "label", keywords: "tag category type" },
      { emoji: "🔖", name: "bookmark", keywords: "mark saved reference" },
      { emoji: "✅", name: "check mark", keywords: "completed finished done pass" },
      { emoji: "⚠️", name: "warning", keywords: "caution attention alert" },
      { emoji: "❌", name: "cross mark", keywords: "wrong cancel delete" },
      { emoji: "💬", name: "speech bubble", keywords: "doubt comment note discussion" },
      { emoji: "📦", name: "package", keywords: "backup export bundle archive" },
      { emoji: "🧭", name: "compass", keywords: "direction guidance navigation" },
    ],
  },
];

/**
 * Interactive Apple Emoji Picker modal / popover.
 * Allows users to browse and search the Apple iOS Emoji Mega Pack with instant live previews.
 */
export function AppleEmojiPicker({
  value,
  onSelect,
  onClose,
}: {
  value?: string;
  onSelect: (emoji: string) => void;
  onClose?: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState("study");
  const [search, setSearch] = useState("");
  const searchInputId = useId();

  const trimmedSearch = search.trim().toLowerCase();

  const filteredEmojis = trimmedSearch
    ? APPLE_EMOJI_MEGA_PACK.flatMap((c) => c.emojis).filter(
        (e) =>
          e.name.toLowerCase().includes(trimmedSearch) ||
          e.keywords.toLowerCase().includes(trimmedSearch) ||
          e.emoji.includes(trimmedSearch)
      )
    : APPLE_EMOJI_MEGA_PACK.find((c) => c.id === activeCategory)?.emojis || [];

  return (
    <div
      role="dialog"
      aria-label="Apple Emoji Picker"
      className="flex flex-col rounded-2xl border border-line bg-surface p-4 text-fg shadow-2xl w-full max-w-sm sm:max-w-md animate-fade-in"
    >
      {/* Header & Search Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <AppleEmoji emoji="✨" size={18} />
          <span className="font-sans text-xs font-semibold text-fg tracking-wide">
            Apple iOS Emoji Pack
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close emoji picker"
            className="rounded-lg p-1 text-muted hover:text-fg hover:bg-white/5 transition-all cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="mt-3 relative">
        <input
          id={searchInputId}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Apple emojis (e.g. fire, books, zen, study)..."
          className="w-full h-9 rounded-xl border border-line-strong bg-bg px-3 text-xs text-fg placeholder:text-muted focus:border-sky-400 focus:outline-none transition-all"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-2 text-xs text-muted hover:text-fg"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Tabs (shown when not searching) */}
      {!trimmedSearch && (
        <div className="flex items-center gap-1 overflow-x-auto py-2.5 no-scrollbar border-b border-line">
          {APPLE_EMOJI_MEGA_PACK.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-sans whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  active
                    ? "bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30"
                    : "text-muted hover:text-fg hover:bg-surface2 border border-transparent"
                }`}
              >
                <AppleEmoji emoji={cat.icon} size={14} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="mt-3 max-h-56 overflow-y-auto pr-1">
        {filteredEmojis.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">
            No emojis found for "{search}".
          </div>
        ) : (
          <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5">
            {filteredEmojis.map((item) => {
              const isSelected = value === item.emoji;
              return (
                <button
                  key={item.emoji}
                  type="button"
                  title={`${item.name} (${item.emoji})`}
                  aria-label={`Select ${item.name} emoji`}
                  onClick={() => {
                    onSelect(item.emoji);
                    onClose?.();
                  }}
                  className={`flex size-11 items-center justify-center rounded-xl border transition-all cursor-pointer group active:scale-90 ${
                    isSelected
                      ? "border-sky-400 bg-sky-500/20 shadow-md ring-1 ring-sky-400"
                      : "border-line bg-surface2 hover:bg-surface3 hover:border-line-strong"
                  }`}
                >
                  <AppleEmoji
                    emoji={item.emoji}
                    size={24}
                    className="group-hover:scale-110 transition-transform duration-150"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Preview / Selected Info */}
      <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between text-xs text-muted">
        <span>Click an emoji to apply</span>
        {value && (
          <div className="flex items-center gap-1.5 font-medium text-fg">
            <span>Selected:</span>
            <AppleEmoji emoji={value} size={16} />
          </div>
        )}
      </div>
    </div>
  );
}
