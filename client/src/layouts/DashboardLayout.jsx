import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import toast from "react-hot-toast";
import BrandLogo from "../components/BrandLogo";

const navItems = [
  { to: "/dashboard", label: "Home", icon: "⊞", end: true },
  { to: "/dashboard/quiz", label: "Quiz Generator", icon: "⚡" },
  { to: "/dashboard/assignment", label: "Assignment", icon: "📝" },
  { to: "/dashboard/paper", label: "Question Paper", icon: "📄" },
  { to: "/dashboard/saved", label: "Saved Papers", icon: "📚" },
  { to: "/dashboard/analytics", label: "Analytics", icon: "📊" },
  { to: "/dashboard/subscription", label: "Subscription", icon: "💎" },
];

const mobileBottomNav = [
  { to: "/dashboard", label: "Home", icon: "⊞", end: true },
  { to: "/dashboard/quiz", label: "Quiz", icon: "⚡" },
  { to: "/dashboard/assignment", label: "Assign", icon: "📝" },
  { to: "/dashboard/paper", label: "Paper", icon: "📄" },
  { to: "/dashboard/saved", label: "Saved", icon: "📚" },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success("Logged out");
    navigate("/");
  };

  const planColors = {
    free: "bg-gray-100 text-gray-600",
    teacher: "bg-blue-100 text-blue-700",
    institute: "bg-purple-100 text-purple-700",
    school: "bg-green-100 text-green-700",
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop always visible, mobile slide-in */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-100 flex-shrink-0">
          <BrandLogo size="sm" />
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mt-2 ${
                  isActive ? "bg-red-50 text-red-700" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              <span className="text-base">🛡️</span>
              Admin Panel
            </NavLink>
          )}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700 flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || "T"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                planColors[user?.plan] || planColors.free
              }`}
            >
              {user?.plan?.toUpperCase() || "FREE"}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-4 sticky top-0 z-10 flex-shrink-0">
          {/* Hamburger — opens sidebar on mobile */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Open navigation"
          >
            <div className="w-5 h-0.5 bg-gray-600 mb-1.5 rounded" />
            <div className="w-5 h-0.5 bg-gray-600 mb-1.5 rounded" />
            <div className="w-5 h-0.5 bg-gray-600 rounded" />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">
              Hello, {user?.name?.split(" ")[0]} 👋
            </span>
            {/* Avatar visible on mobile header */}
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
              {user?.name?.[0]?.toUpperCase() || "T"}
            </div>
          </div>
        </header>

        {/* Page content — pb-20 reserves space for mobile bottom nav */}
        <main className="flex-1 p-4 sm:p-6 overflow-auto pb-20 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex lg:hidden z-20">
        {mobileBottomNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-h-[52px] ${
                isActive ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"
              }`
            }
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[9px] font-medium leading-none">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
