"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/app/components/PageHeader";
import { TransactionForm } from "@/app/components/transactions/TransactionForm";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { addTransaction, getCategories, getWallets } from "@/lib/db";
import type { Category, Wallet } from "@/lib/types";

export default function AddTransactionPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    Promise.all([getCategories(), getWallets()])
      .then(([categoryRows, walletRows]) => {
        setCategories(categoryRows);
        setWallets(walletRows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main>
      <PageHeader
        title="New Transaction"
        subtitle="Quick Entry"
        actions={
          <Link href="/transactions">
            <Button variant="secondary" className="text-xs">
              History
            </Button>
          </Link>
        }
      />

      {loading ? (
        <p className="muted text-sm">Loading form...</p>
      ) : (
        <Modal
          open
          onClose={() => router.push("/")}
          title="New Transaction"
          subtitle="Quick Entry"
        >
          <TransactionForm
            categories={categories}
            wallets={wallets}
            submitLabel="Save Transaction"
            onSubmit={async (values) => {
              await addTransaction(values);
              router.push("/");
            }}
          />
        </Modal>
      )}
    </main>
  );
}
