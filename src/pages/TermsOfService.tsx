import { AlertCircle, FileText, LockKeyhole, Scale, ShieldCheck, UserCheck } from 'lucide-react';
import LegalDocument from './LegalDocument';

const TermsOfService = () => (
  <LegalDocument
    icon={<Scale className="h-6 w-6" />}
    label="Documento Legal"
    title="Termos de Serviço"
    description="Estes termos regulam o acesso e o uso do sistema MSV Acium, incluindo recursos de gestão, atendimento, automação e relatórios disponibilizados aos usuários autorizados."
    complianceNote="Ao acessar o sistema, o usuário declara estar ciente destes termos e das políticas aplicáveis."
    sections={[
      {
        number: '01',
        title: 'Aceitação dos Termos',
        content:
          'Ao criar uma conta, acessar ou utilizar o MSV Acium, o usuário concorda com estes Termos de Serviço. Caso não concorde com qualquer condição, o uso do sistema deve ser interrompido.',
        icon: <UserCheck className="h-5 w-5" />,
      },
      {
        number: '02',
        title: 'Uso Permitido',
        content:
          'O sistema deve ser utilizado apenas para atividades legítimas relacionadas à gestão comercial, atendimento a clientes, organização de produtos, campanhas e acompanhamento operacional da loja.',
        icon: <ShieldCheck className="h-5 w-5" />,
      },
      {
        number: '03',
        title: 'Conta e Credenciais',
        content:
          'Cada usuário é responsável por manter suas credenciais em sigilo e por todas as atividades realizadas em sua conta. O compartilhamento indevido de acesso pode resultar em bloqueio ou revisão da conta.',
        icon: <LockKeyhole className="h-5 w-5" />,
      },
      {
        number: '04',
        title: 'Conteúdos e Informações',
        content:
          'Os dados inseridos no sistema, incluindo cadastros, produtos, mensagens, leads e relatórios, devem ser corretos, autorizados e compatíveis com a legislação aplicável e com as políticas internas da empresa.',
        icon: <FileText className="h-5 w-5" />,
      },
      {
        number: '05',
        title: 'Disponibilidade do Serviço',
        content:
          'Buscamos manter o sistema disponível e seguro, mas poderão ocorrer interrupções temporárias por manutenção, atualizações, falhas técnicas, indisponibilidade de integrações externas ou eventos fora do nosso controle.',
        icon: <AlertCircle className="h-5 w-5" />,
      },
      {
        number: '06',
        title: 'Alterações dos Termos',
        content:
          'Estes termos podem ser atualizados para refletir mudanças no sistema, em processos internos ou em exigências legais. A versão publicada nesta página será considerada a versão vigente.',
        icon: <Scale className="h-5 w-5" />,
      },
    ]}
  />
);

export default TermsOfService;
