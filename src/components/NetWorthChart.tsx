import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { type Category, MONTHS } from "../data/defaultCategories";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

interface Props {
  year: number;
  categories: Category[];
  getCategoryMonthTotal: (
    year: number,
    monthIndex: number,
    categoryId: string,
  ) => number;
  getMonthTotal: (year: number, monthIndex: number) => number;
}

const CATEGORY_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
];

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000)
    return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function withOpacity(hexColor: string, alpha: string): string {
  return `${hexColor}${alpha}`;
}

export default function NetWorthChart({
  year,
  categories,
  getCategoryMonthTotal,
  getMonthTotal,
}: Props) {
  const monthlyTotals = MONTHS.map((_, i) => getMonthTotal(year, i));
  const hasAnyData = monthlyTotals.some((total) => total !== 0);

  if (!hasAnyData) {
    return (
      <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-gray-300 text-gray-400 text-sm">
        Enter values in the table above to see the chart
      </div>
    );
  }

  const data: ChartData<"line"> = {
    labels: MONTHS,
    datasets: categories.map((cat, idx) => {
      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
      return {
        label: cat.name,
        data: MONTHS.map((_, monthIndex) =>
          getCategoryMonthTotal(year, monthIndex, cat.id),
        ),
        borderColor: color,
        backgroundColor: withOpacity(color, "22"),
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      };
    }),
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          color: "#4b5563",
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          label(context: TooltipItem<"line">) {
            const value = context.parsed.y ?? 0;
            return `${context.dataset.label}: ${formatCurrency(value)}`;
          },
          footer(items) {
            const total = items.reduce((sum, item) => sum + (item.parsed.y ?? 0), 0);
            return `Total: ${formatCurrency(total)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: "#6b7280",
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: "#6b7280",
          callback(value) {
            return formatCurrency(Number(value));
          },
        },
        grid: {
          color: "#f0f0f0",
        },
      },
    },
  };

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm bg-white p-4">
      <h2 className="text-base font-semibold text-gray-700 mb-4">
        Net Worth — {year}
      </h2>
      <div className="h-80">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
