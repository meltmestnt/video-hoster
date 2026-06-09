import { buildPagedUrl } from "@/lib/seo-pagination";

interface Props {
  // Bare path for the listing (e.g. "/gifs", "/videos", "/all", "/").
  path: string;
  page: number;
  hasNextPage: boolean;
}

// Crawl-only pagination footer. The grid above keeps the JS infinite
// scroll UX users expect; this nav exists so Googlebot has plain `<a
// href="?page=N">` links to follow when it reaches the bottom of the
// SSR'd HTML. The container is visually hidden but kept in the DOM and
// accessibility tree under aria-hidden="true" so screen readers don't
// announce a duplicate, browser-rendered "Older" link beside the
// infinite scroll.
//
// We intentionally render only prev/next (not 1..N) — that's enough for
// crawlers to discover every page incrementally, and the full
// enumeration lives in sitemap.xml where it belongs.
export function SeoPagination({ path, page, hasNextPage }: Props) {
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = hasNextPage ? page + 1 : null;
  if (prevPage === null && nextPage === null) return null;

  return (
    <nav
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {prevPage !== null && (
        <a rel="prev" href={buildPagedUrl(path, prevPage)}>
          Previous page
        </a>
      )}
      {nextPage !== null && (
        <a rel="next" href={buildPagedUrl(path, nextPage)}>
          Next page
        </a>
      )}
    </nav>
  );
}
