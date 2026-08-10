-- Stores only the extracted plain text from a specialty's reference PDF, not
-- the binary itself — much cheaper, and the source PDF isn't needed again
-- since printing reformats this text on demand.
create table if not exists specialty_documents (
  id uuid primary key default gen_random_uuid(),
  specialty_id uuid not null references clinical_specialties(id) on delete cascade,
  title text not null,
  extracted_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists specialty_documents_specialty_idx on specialty_documents (specialty_id);
