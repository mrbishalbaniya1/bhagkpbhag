'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    const navItems = [
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/analytics', label: 'Analytics' },
    ];

    return (
        <div>
            <nav className="bg-muted">
                <div className="container mx-auto flex items-center gap-4 p-4">
                    {navItems.map(item => (
                        <Link key={item.href} href={item.href}
                           className={cn(
                                "text-sm font-medium transition-colors hover:text-primary",
                                pathname === item.href ? "text-primary" : "text-muted-foreground"
                           )}>
                                {item.label}
                        </Link>
                    ))}
                </div>
            </nav>
            {children}
        </div>
    );
}
