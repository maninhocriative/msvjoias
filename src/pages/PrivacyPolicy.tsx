import { Shield, Lock, MessageCircle, UserCheck, Eye, FileText, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      {/* Header */}
      <header className="border-b border-stone-200/60 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>
          <span className="text-xs tracking-[0.3em] uppercase text-stone-400 font-medium">
            Acium Manaus
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-stone-900 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-stone-400 font-medium">
              Documento Legal
            </p>
            <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
              Política de Privacidade
            </h1>
          </div>
        </div>
        <p className="text-stone-500 text-base leading-relaxed max-w-2xl">
          Na Acium Manaus, valorizamos sua privacidade e nos comprometemos com a
          transparência no tratamento dos seus dados pessoais.
        </p>
        <p className="text-xs text-stone-400 mt-4">
          Última atualização: {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </section>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent" />
      </div>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid gap-10">
          {/* Section 1 */}
          <PolicySection
            icon={<FileText className="w-5 h-5" />}
            number="01"
            title="Dados Coletados"
            content="As informações coletadas em nossos formulários incluem: nome completo, número de telefone e endereço de e-mail. Esses dados são fornecidos voluntariamente por você ao preencher nossos formulários de contato."
          />

          {/* Section 2 */}
          <PolicySection
            icon={<Eye className="w-5 h-5" />}
            number="02"
            title="Finalidade do Uso"
            content="Os dados coletados serão utilizados exclusivamente para contato comercial via WhatsApp pela equipe da Acium Manaus. Isso inclui o envio de informações sobre produtos, promoções, catálogos e atendimento personalizado ao cliente."
          />

          {/* Section 3 */}
          <PolicySection
            icon={<Lock className="w-5 h-5" />}
            number="03"
            title="Compartilhamento de Dados"
            content="Seus dados pessoais não serão compartilhados, vendidos ou alugados a terceiros em nenhuma circunstância. Mantemos suas informações protegidas e restritas ao uso interno da Acium Manaus."
          />

          {/* Section 4 */}
          <PolicySection
            icon={<UserCheck className="w-5 h-5" />}
            number="04"
            title="Seus Direitos"
            content="De acordo com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), você tem o direito de solicitar acesso, correção, exclusão ou portabilidade dos seus dados pessoais a qualquer momento. Basta entrar em contato conosco."
          />

          {/* Section 5 */}
          <PolicySection
            icon={<Shield className="w-5 h-5" />}
            number="05"
            title="Segurança dos Dados"
            content="Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados pessoais contra acesso não autorizado, perda, alteração ou destruição. Nosso compromisso é garantir a integridade e confidencialidade das suas informações."
          />

          {/* Section 6 */}
          <PolicySection
            icon={<MessageCircle className="w-5 h-5" />}
            number="06"
            title="Contato"
            content="Para dúvidas, solicitações ou esclarecimentos sobre esta Política de Privacidade ou sobre o tratamento dos seus dados pessoais, entre em contato pelo nosso WhatsApp. Nossa equipe está à disposição para atendê-lo."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200/60 bg-stone-50/50">
        <div className="max-w-4xl mx-auto px-6 py-10 text-center">
          <p className="text-xs tracking-[0.2em] uppercase text-stone-400 font-medium mb-2">
            Acium Manaus
          </p>
          <p className="text-sm text-stone-500">
            © {new Date().getFullYear()} Acium Manaus. Todos os direitos reservados.
          </p>
          <p className="text-xs text-stone-400 mt-2">
            Este documento está em conformidade com a LGPD (Lei nº 13.709/2018).
          </p>
        </div>
      </footer>
    </div>
  );
};

const PolicySection = ({
  icon,
  number,
  title,
  content,
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  content: string;
}) => (
  <div className="group flex gap-6">
    <div className="flex flex-col items-center shrink-0">
      <div className="w-10 h-10 rounded-xl bg-stone-100 group-hover:bg-stone-900 text-stone-500 group-hover:text-white flex items-center justify-center transition-all duration-300">
        {icon}
      </div>
      <div className="w-px flex-1 bg-stone-200/60 mt-3" />
    </div>
    <div className="pb-2">
      <span className="text-[10px] tracking-[0.2em] uppercase text-stone-400 font-medium">
        Seção {number}
      </span>
      <h2 className="text-lg font-semibold text-stone-900 mt-1 mb-3">{title}</h2>
      <p className="text-stone-600 leading-relaxed text-[15px]">{content}</p>
    </div>
  </div>
);

export default PrivacyPolicy;
