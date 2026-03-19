"use client";

import Link from "next/link";
import { PageHeader } from "@/app/components/PageHeader";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

export default function PlanningPage() {
  return (
    <main>
      <PageHeader title="Planning" subtitle="Money Workflows" />

      <section className="space-y-4">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Planning Modules
          </p>
          <p className="text-sm muted">
            Manage recurring money actions and forward-looking targets in one place.
          </p>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <Link href="/budgets">
              <Button variant="secondary" className="w-full">
                Budgets
              </Button>
            </Link>
            <Link href="/templates">
              <Button variant="secondary" className="w-full">
                Recurring
              </Button>
            </Link>
            <Link href="/transfers">
              <Button variant="secondary" className="w-full">
                Transfers
              </Button>
            </Link>
            <Link href="/goals">
              <Button variant="secondary" className="w-full">
                Goals
              </Button>
            </Link>
            <Link href="/debts">
              <Button variant="secondary" className="w-full">
                Debts
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
