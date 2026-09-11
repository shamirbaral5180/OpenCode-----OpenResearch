import { type ComponentProps } from "solid-js"

const gradient = (id: string, y2: number, top: string, bottom: string) => (
  <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={y2}>
    <stop offset="0%" stop-color={top} />
    <stop offset="50%" stop-color={top} />
    <stop offset="50%" stop-color={bottom} />
    <stop offset="100%" stop-color={bottom} />
  </linearGradient>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {gradient("or-mark-outer", 20, "#166334", "#5B21B6")}
        {gradient("or-mark-inner", 20, "#4ADE80", "#A78BFA")}
      </defs>
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="url(#or-mark-inner)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="url(#or-mark-outer)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {gradient("or-splash-outer", 100, "#166334", "#5B21B6")}
        {gradient("or-splash-inner", 100, "#4ADE80", "#A78BFA")}
      </defs>
      <path d="M60 80H20V40H60V80Z" fill="url(#or-splash-inner)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="url(#or-splash-outer)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <defs>
        {gradient("or-logo-outer", 42, "#166334", "#5B21B6")}
        {gradient("or-logo-inner", 42, "#4ADE80", "#A78BFA")}
      </defs>
      <g>
        <path d="M18 30H6V18H18V30Z" fill="url(#or-logo-inner)" />
        <path d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z" fill="url(#or-logo-outer)" />
        <path d="M48 30H36V18H48V30Z" fill="url(#or-logo-inner)" />
        <path d="M36 30H48V12H36V30ZM54 36H36V42H30V6H54V36Z" fill="url(#or-logo-outer)" />
        <path d="M84 24V30H66V24H84Z" fill="url(#or-logo-inner)" />
        <path d="M84 24H66V30H84V36H60V6H84V24ZM66 18H78V12H66V18Z" fill="url(#or-logo-outer)" />
        <path d="M108 36H96V18H108V36Z" fill="url(#or-logo-inner)" />
        <path d="M108 12H96V36H90V6H108V12ZM114 36H108V12H114V36Z" fill="url(#or-logo-outer)" />
        <path d="M144 30H126V18H144V30Z" fill="url(#or-logo-inner)" />
        <path d="M144 12H126V30H144V36H120V6H144V12Z" fill="url(#or-logo-outer)" />
        <path d="M168 30H156V18H168V30Z" fill="url(#or-logo-inner)" />
        <path d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z" fill="url(#or-logo-outer)" />
        <path d="M198 30H186V18H198V30Z" fill="url(#or-logo-inner)" />
        <path d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z" fill="url(#or-logo-outer)" />
        <path d="M234 24V30H216V24H234Z" fill="url(#or-logo-inner)" />
        <path d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z" fill="url(#or-logo-outer)" />
      </g>
    </svg>
  )
}
