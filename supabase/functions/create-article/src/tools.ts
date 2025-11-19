import { DynamicStructuredTool } from "npm:@langchain/core/tools";
import { z } from "npm:zod";
import { parseHTML } from "npm:linkedom";

import { cleanText } from "./utils.ts";

export const createFetchArticleTool = () =>
  new DynamicStructuredTool({
    name: "fetch_article",
    description:
      "指定されたURLからニュース記事の本文を取得して、テキストのみを返します。リンク先を必ず確認してください。",
    schema: z.object({
      url: z.string().url(),
    }),
    func: async ({ url }) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch article: ${response.status}`);
      }
      const html = await response.text();
      const document = (parseHTML(html) as unknown as { document: unknown })
        .document as {
          querySelector: (selectors: string) => unknown;
          body: unknown;
          querySelectorAll: (selectors: string) => Iterable<unknown>;
        };
      const main =
        (document.querySelector("article, main, #main, .main, .article-body") as {
          querySelectorAll: (selectors: string) => Iterable<unknown>;
        } | null) ??
        document.body;
      const paragraphs = Array.from(
        (main as { querySelectorAll: (selectors: string) => Iterable<unknown> })
          .querySelectorAll("p, h2, h3, li"),
      ).map((el) =>
        cleanText(
          (el as { textContent?: string | null }).textContent ?? "",
        )
      );
      const content = cleanText(
        paragraphs.filter((line) => line.length > 0).join("\n"),
      );
      if (!content) {
        throw new Error("記事本文を抽出できませんでした。");
      }
      return content.slice(0, 12000);
    },
  });
