import { Eye, FileText, Lock, MessageCircle, Shield, UserCheck } from 'lucide-react';
import LegalDocument from './LegalDocument';

const PrivacyPolicy = () => (
  <LegalDocument
    icon={<Shield className="h-6 w-6" />}
    label="Documento Legal"
    title="Política de Privacidade"
    description="No MSV Acium, valorizamos sua privacidade e mantemos transparência sobre a coleta, o uso, a proteção e os direitos relacionados aos seus dados pessoais."
    complianceNote="Este documento foi preparado com referência à LGPD (Lei nº 13.709/2018)."
    sections={[
      {
        number: '01',
        title: 'Dados Coletados',
        content:
          'Podemos coletar dados como nome, telefone, e-mail, informações de cadastro, histórico de atendimento, mensagens enviadas por canais integrados e informações necessárias para operação comercial da loja.',
        icon: <FileText className="h-5 w-5" />,
      },
      {
        number: '02',
        title: 'Finalidade do Uso',
        content:
          'Os dados são utilizados para atendimento ao cliente, gestão de produtos e vendas, envio de informações comerciais, organização de leads, automações internas, relatórios e melhoria dos processos da loja.',
        icon: <Eye className="h-5 w-5" />,
      },
      {
        number: '03',
        title: 'Compartilhamento de Dados',
        content:
          'Os dados não são vendidos. Poderemos compartilhar informações apenas com fornecedores e plataformas necessários para operar o sistema, cumprir obrigações legais ou proteger direitos da empresa e dos usuários.',
        icon: <Lock className="h-5 w-5" />,
      },
      {
        number: '04',
        title: 'Seus Direitos',
        content:
          'Conforme a LGPD, você pode solicitar confirmação de tratamento, acesso, correção, portabilidade, anonimização, bloqueio ou exclusão de dados pessoais, observadas as hipóteses legais aplicáveis.',
        icon: <UserCheck className="h-5 w-5" />,
      },
      {
        number: '05',
        title: 'Segurança dos Dados',
        content:
          'Adotamos medidas técnicas e organizacionais para proteger dados pessoais contra acesso não autorizado, perda, alteração, divulgação indevida ou uso incompatível com as finalidades informadas.',
        icon: <Shield className="h-5 w-5" />,
      },
      {
        number: '06',
        title: 'Contato',
        content:
          'Para dúvidas, solicitações ou esclarecimentos sobre esta Política de Privacidade ou sobre o tratamento dos seus dados pessoais, entre em contato pelos canais oficiais da Acium Manaus.',
        icon: <MessageCircle className="h-5 w-5" />,
      },
    ]}
  />
);

export default PrivacyPolicy;
