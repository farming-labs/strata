import type { HTMLAttributes, ReactElement } from "react";
import type { RenderedFragment } from "./index";

export type StaticFragmentBoundary =
  | "article"
  | "aside"
  | "div"
  | "footer"
  | "header"
  | "main"
  | "nav"
  | "section"
  | "span";

export interface StaticFragmentProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "content" | "dangerouslySetInnerHTML"
> {
  as?: StaticFragmentBoundary;
  content: RenderedFragment;
}

export declare function StaticFragment(
  props: StaticFragmentProps,
): ReactElement;
