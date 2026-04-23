import {
  defaultEditorConfig,
  defaultEditorFeatures,
  EXPERIMENTAL_TableFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { MarkdownImportFeature } from './markdownImport/feature.server'

// Single source of truth for the blog post rich-text editor config.
// Both the `blogPosts.content` field and the `/api/cms-mcp/from-markdown`
// endpoint consume this so they cannot drift.
export const blogPostsEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures,
    EXPERIMENTAL_TableFeature(),
    MarkdownImportFeature(),
  ],
})

// Server-side markdown-conversion config mirrors the editor feature set so
// markdown ingested via MCP produces the same Lexical tree as the admin
// "import markdown" button.
export const blogPostsMarkdownImportConfig = {
  ...defaultEditorConfig,
  features: [...defaultEditorFeatures, EXPERIMENTAL_TableFeature(), MarkdownImportFeature()],
}
