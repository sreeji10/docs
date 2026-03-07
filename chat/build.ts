import { $ } from "bun";

await $`bunx esbuild src/chat-widget.ts --bundle --format=iife --minify --outfile=dist/chat-widget.js`;
