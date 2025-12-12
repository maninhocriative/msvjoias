import { Outlet } from 'react-router-dom';
import Header from './Header';

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
