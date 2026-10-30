import { useState, useEffect } from "react";
import { Calendar, Clock, Sparkles } from "lucide-react";

export default function DashboardHero({ role }: { role: "admin" | "manager" }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const hour = Number(time.toLocaleString("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Africa/Luanda" }));
  const greeting = hour >= 5 && hour < 12 ? "Bom dia" : hour < 18 && hour >= 12 ? "Boa tarde" : "Boa noite";
  return <header className="mb-8 border-b pb-6 pt-2">
    <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="h-4 w-4" />Boas-vindas · {role === "admin" ? "Administrador" : "Gestor"}</p>
    <h1 className="text-3xl font-extrabold text-foreground md:text-4xl">{greeting}, {role === "admin" ? "Administrador" : "Gestor"}!</h1>
    <p className="mt-3 text-muted-foreground">{role === "admin" ? "Giltraquino Comercial · Visão geral dos estabelecimentos" : "Visão geral das suas lojas e restaurantes"}</p>
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
      <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />{time.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Luanda" })}</span>
      <span className="flex items-center gap-2 font-mono"><Clock className="h-4 w-4 text-primary" />{time.toLocaleTimeString("pt-PT", { timeZone: "Africa/Luanda" })} · Luanda</span>
    </div>
  </header>;
}
