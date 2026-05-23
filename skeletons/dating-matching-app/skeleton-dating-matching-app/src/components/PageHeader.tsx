export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <header className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1 className="title">{title}</h1><p className="subtitle">{subtitle}</p></div>{action}</header>;
}
