import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

type LegalSection = {
  number: string;
  title: string;
  content: string;
  icon: ReactNode;
};

type LegalDocumentProps = {
  icon: ReactNode;
  label: string;
  title: string;
  description: string;
  complianceNote?: string;
  sections: LegalSection[];
};

const updatedAt = new Date().toLocaleDateString('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const LegalDocument = ({
  icon,
  label,
  title,
  description,
  complianceNote,
  sections,
}: LegalDocumentProps) => (
  <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white text-stone-900">
    <header className="sticky top-0 z-10 border-b border-stone-200/60 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link
          to="/auth"
          className="flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <span className="text-xs font-medium uppercase tracking-[0.3em] text-stone-400">
          MSV Acium
        </span>
      </div>
    </header>

    <main>
      <section className="mx-auto max-w-4xl px-6 pb-12 pt-20">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-white">
            {icon}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
              {label}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              {title}
            </h1>
          </div>
        </div>
        <p className="max-w-2xl text-base leading-relaxed text-stone-500">
          {description}
        </p>
        <p className="mt-4 text-xs text-stone-400">Última atualização: {updatedAt}</p>
      </section>

      <div className="mx-auto max-w-4xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent" />
      </div>

      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-10">
          {sections.map((section) => (
            <LegalSectionItem key={section.number} {...section} />
          ))}
        </div>
      </section>
    </main>

    <footer className="border-t border-stone-200/60 bg-stone-50/50">
      <div className="mx-auto max-w-4xl px-6 py-10 text-center">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
          MSV Acium
        </p>
        <p className="text-sm text-stone-500">
          © {new Date().getFullYear()} MSV Acium. Todos os direitos reservados.
        </p>
        {complianceNote && <p className="mt-2 text-xs text-stone-400">{complianceNote}</p>}
      </div>
    </footer>
  </div>
);

const LegalSectionItem = ({ icon, number, title, content }: LegalSection) => (
  <div className="group flex gap-6">
    <div className="flex shrink-0 flex-col items-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-500 transition-all duration-300 group-hover:bg-stone-900 group-hover:text-white">
        {icon}
      </div>
      <div className="mt-3 w-px flex-1 bg-stone-200/60" />
    </div>
    <div className="pb-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone-400">
        Seção {number}
      </span>
      <h2 className="mb-3 mt-1 text-lg font-semibold text-stone-900">{title}</h2>
      <p className="text-[15px] leading-relaxed text-stone-600">{content}</p>
    </div>
  </div>
);

export default LegalDocument;
