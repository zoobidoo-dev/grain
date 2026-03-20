"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { readLocalStorage, writeLocalStorage } from "@/lib/browser-storage";
import {
  ONBOARDING_START_EVENT,
  ONBOARDING_STORAGE_KEY,
} from "@/lib/constants";

type StepLink = {
  href: string;
  label: string;
};

type OnboardingStep = {
  title: string;
  route: string;
  navLabel: string;
  description: string;
  highlights: string[];
  links: StepLink[];
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Home Dashboard",
    route: "/",
    navLabel: "Home",
    description:
      "Get a quick view of your current month and jump into the most common actions.",
    highlights: [
      "See your net, income, and expenses for this month.",
      "Budget Focus surfaces categories getting close to limits.",
      "Recent Transactions gives you the latest activity snapshot.",
    ],
    links: [
      { href: "/", label: "Open Dashboard" },
      { href: "/transactions/new", label: "Add Transaction" },
    ],
  },
  {
    title: "Transaction History",
    route: "/transactions",
    navLabel: "History",
    description:
      "Track every expense and income entry, then drill down with filters when needed.",
    highlights: [
      "Use smart search, amount bounds, date ranges, and category filters.",
      "Inspect grouped history by date for easier review.",
      "Add new entries quickly from the action button.",
    ],
    links: [
      { href: "/transactions", label: "Open History" },
      { href: "/transactions/new", label: "Quick Add Entry" },
    ],
  },
  {
    title: "Insights",
    route: "/insights",
    navLabel: "Insights",
    description:
      "Analyze patterns so you can spot where money is going and how it changes over time.",
    highlights: [
      "Switch between daily, weekly, monthly, and quarterly trend views.",
      "Compare income vs expense bars over recent buckets.",
      "Review category share for the current month.",
    ],
    links: [{ href: "/insights", label: "Open Insights" }],
  },
  {
    title: "Planning Workflows",
    route: "/planning",
    navLabel: "Plans",
    description:
      "Use planning tools to set guardrails, automate recurring entries, and define goals.",
    highlights: [
      "Budgets help you enforce monthly category limits.",
      "Recurring templates save time on repeat transactions.",
      "Transfers and goals support account movements and savings targets.",
    ],
    links: [
      { href: "/planning", label: "Open Planning Hub" },
      { href: "/budgets", label: "Go to Budgets" },
      { href: "/templates", label: "Go to Recurring" },
      { href: "/goals", label: "Go to Goals" },
    ],
  },
  {
    title: "Wallets",
    route: "/wallets",
    navLabel: "Wallets",
    description:
      "Keep account balances organized and move funds between wallets when needed.",
    highlights: [
      "Create wallets for cash, bank, and card accounts.",
      "Track calculated balances from transactions and transfers.",
      "Jump to transfers directly from the wallets screen.",
    ],
    links: [
      { href: "/wallets", label: "Open Wallets" },
      { href: "/transfers", label: "Open Transfers" },
    ],
  },
  {
    title: "Settings and Maintenance",
    route: "/settings",
    navLabel: "Settings",
    description:
      "Control app preferences and data-management tools from one place.",
    highlights: [
      "Set your currency and locale preferences.",
      "Manage categories, backups, and JSON imports/exports.",
      "Replay this onboarding guide any time from Settings.",
    ],
    links: [
      { href: "/settings", label: "Open Settings" },
      { href: "/categories", label: "Manage Categories" },
    ],
  },
];

function routeMatches(pathname: string, route: string) {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function OnboardingTour() {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const markSeen = useCallback(() => {
    writeLocalStorage(ONBOARDING_STORAGE_KEY, "1");
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, index));
      const target = ONBOARDING_STEPS[next];
      setStepIndex(next);
      setOpen(true);
      if (!routeMatches(pathnameRef.current, target.route)) {
        router.push(target.route);
      }
    },
    [router],
  );

  const startTour = useCallback(() => {
    markSeen();
    goToStep(0);
  }, [goToStep, markSeen]);

  const closeTour = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  useEffect(() => {
    const hasSeen = readLocalStorage(ONBOARDING_STORAGE_KEY) === "1";
    if (hasSeen) return;
    const timer = window.setTimeout(() => startTour(), 0);
    return () => window.clearTimeout(timer);
  }, [startTour]);

  useEffect(() => {
    const onStart = () => startTour();
    window.addEventListener(ONBOARDING_START_EVENT, onStart);
    return () => window.removeEventListener(ONBOARDING_START_EVENT, onStart);
  }, [startTour]);

  const step = ONBOARDING_STEPS[stepIndex];
  const atLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const isOnStepRoute = routeMatches(pathname, step.route);
  const progress = ((stepIndex + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <Modal
      open={open}
      onClose={closeTour}
      title="Welcome to Grain"
      subtitle="Interactive onboarding"
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              if (stepIndex === 0) {
                closeTour();
                return;
              }
              goToStep(stepIndex - 1);
            }}
          >
            {stepIndex === 0 ? "Skip Tour" : "Back"}
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              if (atLastStep) {
                closeTour();
                return;
              }
              goToStep(stepIndex + 1);
            }}
          >
            {atLastStep ? "Finish" : "Next"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs matrix-label text-[var(--muted)]">
            Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
          </p>
          <h2 className="mt-1 text-lg matrix-label">{step.title}</h2>
          <p className="mt-2 text-sm muted">{step.description}</p>
        </div>

        <div className="h-1 bg-[var(--surface-elevated)]">
          <div
            className="h-1 bg-white transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="rounded-none border border-[var(--border)] p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Where to find this
          </p>
          <p className="mt-1 text-sm matrix-label">{step.navLabel}</p>
          <p className="mt-1 text-xs muted">
            {isOnStepRoute
              ? "You are in the right section now."
              : `Use the ${step.navLabel} tab in bottom navigation.`}
          </p>
        </div>

        <ul className="space-y-2">
          {step.highlights.map((item) => (
            <li
              key={item}
              className="rounded-none border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-sm"
            >
              {item}
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {step.links.map((link) => (
            <Link key={`${step.route}-${link.href}-${link.label}`} href={link.href}>
              <Button variant="ghost" className="w-full text-[0.62rem]">
                {link.label}
              </Button>
            </Link>
          ))}
        </div>
      </div>
    </Modal>
  );
}
