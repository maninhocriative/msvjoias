import { Clock, Database, FileCheck, MessageCircle, Shield, Trash2 } from 'lucide-react';
import LegalDocument from './LegalDocument';

const DataDeletion = () => (
  <LegalDocument
    icon={<Trash2 className="h-6 w-6" />}
    label="Instruções de Privacidade"
    title="Exclusão de Dados do Usuário"
    description="Esta página explica como um usuário pode solicitar a exclusão de seus dados pessoais tratados pelo MSV Acium, conforme os direitos previstos na LGPD."
    complianceNote="Solicitações serão analisadas conforme a LGPD e demais obrigações legais aplicáveis."
    sections={[
      {
        number: '01',
        title: 'Como Solicitar',
        content:
          'Para solicitar a exclusão de dados pessoais, entre em contato com a equipe responsável pelo atendimento da Acium Manaus pelo canal oficial de WhatsApp ou pelo canal administrativo informado pela loja.',
        icon: <MessageCircle className="h-5 w-5" />,
      },
      {
        number: '02',
        title: 'Informações Necessárias',
        content:
          'A solicitação deve informar nome completo, telefone, e-mail utilizado no atendimento ou cadastro e uma descrição objetiva do pedido, para que possamos localizar os registros corretamente.',
        icon: <FileCheck className="h-5 w-5" />,
      },
      {
        number: '03',
        title: 'Validação da Identidade',
        content:
          'Antes da exclusão, poderemos solicitar informações adicionais para confirmar que o pedido está sendo feito pelo titular dos dados ou por representante autorizado.',
        icon: <Shield className="h-5 w-5" />,
      },
      {
        number: '04',
        title: 'Dados Abrangidos',
        content:
          'A exclusão pode abranger dados de contato, histórico de atendimento, cadastros vinculados e demais informações pessoais mantidas no sistema, observadas as limitações legais e operacionais.',
        icon: <Database className="h-5 w-5" />,
      },
      {
        number: '05',
        title: 'Prazo de Atendimento',
        content:
          'As solicitações serão avaliadas e respondidas em prazo razoável, considerando a complexidade do pedido, a necessidade de validação e eventuais obrigações legais de conservação de registros.',
        icon: <Clock className="h-5 w-5" />,
      },
      {
        number: '06',
        title: 'Retenção Obrigatória',
        content:
          'Alguns dados poderão ser mantidos quando houver obrigação legal, necessidade de prevenção a fraudes, exercício regular de direitos ou cumprimento de contratos e registros fiscais.',
        icon: <Trash2 className="h-5 w-5" />,
      },
    ]}
  />
);

export default DataDeletion;
