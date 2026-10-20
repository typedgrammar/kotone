// Minimal stroke icons (16px grid), coloured with currentColor.

const Svg = (props: { d: string; fill?: boolean; size?: number }) => (
  <svg
    width={props.size ?? 16}
    height={props.size ?? 16}
    viewBox="0 0 16 16"
    fill={props.fill ? "currentColor" : "none"}
    stroke={props.fill ? "none" : "currentColor"}
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d={props.d} />
  </svg>
);

export const IconPlay = (p: { size?: number }) => <Svg fill size={p.size} d="M4.5 2.8v10.4c0 .5.5.8.9.5l8-5.2a.6.6 0 0 0 0-1L5.4 2.3c-.4-.3-.9 0-.9.5Z" />;
export const IconPause = (p: { size?: number }) => <Svg fill size={p.size} d="M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z" />;
export const IconStar = (p: { filled?: boolean } = {}) => (
  <Svg fill={p.filled} d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z" />
);
export const IconFolder = () => <Svg d="M2 4.5c0-.6.4-1 1-1h3.2l1.3 1.5H13c.6 0 1 .4 1 1V12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1Z" />;
export const IconPlus = () => <Svg d="M8 3v10M3 8h10" />;
export const IconImport = () => <Svg d="M8 2.5v7.5M5 7l3 3 3-3M2.5 10.5v2c0 .6.4 1 1 1h9c.6 0 1-.4 1-1v-2" />;
export const IconMusic = () => <Svg d="M6 12.5V3.5l7-1.5v9M6 12.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM13 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />;
export const IconLink = () => <Svg d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />;
export const IconGear = () => (
  <Svg d="M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM13.1 9.4l1 .8-1.2 2.1-1.3-.4a4.6 4.6 0 0 1-1.4.8l-.3 1.3H7.5l-.3-1.3a4.6 4.6 0 0 1-1.4-.8l-1.3.4-1.2-2.1 1-.8a4.7 4.7 0 0 1 0-1.6l-1-.9 1.2-2 1.3.4c.4-.4.9-.6 1.4-.8l.3-1.3h2.4l.3 1.3c.5.2 1 .4 1.4.8l1.3-.4 1.2 2-1 .9c.1.5.1 1.1 0 1.6Z" />
);
export const IconRedo = () => <Svg d="M13 8a5 5 0 1 1-1.6-3.7M13.2 2.6v2.9h-2.9" />;
export const IconArrow = () => <Svg d="M6 3.5L10.5 8 6 12.5" />;

// sidebar
export const IconLyrics = () => <Svg d="M2.5 4h6M2.5 7.5h5M2.5 11h3.5M12 10.5V3l2.5 1M12 10.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Z" />;
export const IconBook = () => <Svg d="M8 4.2C6.8 3.2 5 2.8 2.5 3v9.5c2.5-.2 4.3.2 5.5 1.2 1.2-1 3-1.4 5.5-1.2V3C11 2.8 9.2 3.2 8 4.2ZM8 4.2v9.5" />;
export const IconCards = () => (
  <Svg d="M5 4.5V3.5c0-.6.4-1 1-1h6.5c.6 0 1 .4 1 1V10c0 .6-.4 1-1 1H11M2.5 5.5c0-.6.4-1 1-1h6.5c.6 0 1 .4 1 1v7c0 .6-.4 1-1 1H3.5c-.6 0-1-.4-1-1Z" />
);
export const IconSearch = () => <Svg d="M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM10.6 10.6 14 14" />;
export const IconGrid = () => <Svg d="M2.5 3.5c0-.6.4-1 1-1h3c.6 0 1 .4 1 1v3c0 .6-.4 1-1 1h-3c-.6 0-1-.4-1-1ZM8.5 3.5c0-.6.4-1 1-1h3c.6 0 1 .4 1 1v3c0 .6-.4 1-1 1h-3c-.6 0-1-.4-1-1ZM2.5 9.5c0-.6.4-1 1-1h3c.6 0 1 .4 1 1v3c0 .6-.4 1-1 1h-3c-.6 0-1-.4-1-1ZM8.5 9.5c0-.6.4-1 1-1h3c.6 0 1 .4 1 1v3c0 .6-.4 1-1 1h-3c-.6 0-1-.4-1-1Z" />;
export const IconSpotify = () => (
  <Svg d="M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM4.6 6.4c2.3-.7 4.9-.5 6.9.6M5 8.7c1.9-.5 3.9-.3 5.5.6M5.4 10.9c1.4-.4 2.8-.2 4 .4" />
);
