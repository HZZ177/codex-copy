import type { TableHTMLAttributes } from "react";

export function MarkdownTable({ node: _node, ...props }: TableHTMLAttributes<HTMLTableElement> & { node?: unknown }) {
  return (
    <div className="keydex-markdown-table-scroll" data-scroll-axis="x">
      <table {...props} />
    </div>
  );
}
