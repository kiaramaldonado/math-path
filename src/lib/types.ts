// Row shapes shared by the server and the browser editor.

export type Status = "draft" | "published";

export interface Notebook {
  id: number;
  slug: string;
  title: string;
  subject: string;
  description: string;
  color: string;
  position: number;
  status: Status;
  updated_at: string;
  page_count?: number;
}
export interface Section {
  id: number;
  notebook_id: number;
  slug: string;
  title: string;
  position: number;
  status: Status;
}
export interface PageMeta {
  id: number;
  section_id: number;
  slug: string;
  title: string;
  position: number;
  status: Status;
  updated_at: string;
}
export interface Page extends PageMeta {
  content_json: string;
  created_at: string;
}
export interface SectionWithPages extends Section {
  pages: PageMeta[];
}
export interface Post {
  id: number;
  kind: "blog" | "project";
  slug: string;
  title: string;
  summary: string;
  content_json: string;
  cover_key: string | null;
  links_json: string;
  tags: string;
  status: Status;
  published_at: string | null;
  updated_at: string;
}
export interface Certificate {
  id: number;
  title: string;
  issuer: string;
  issued_on: string | null;
  url: string;
  file_key: string | null;
  notebook_id: number | null;
  status: Status;
}
export interface RoadmapItem {
  id: number;
  kind: "course" | "book" | "topic" | "milestone";
  title: string;
  progress: "planned" | "in_progress" | "done";
  started_on: string | null;
  finished_on: string | null;
  notes: string;
  url: string;
  notebook_id: number | null;
  position: number;
  status: Status;
}
