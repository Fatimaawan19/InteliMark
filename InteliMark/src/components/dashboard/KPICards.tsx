import { TrendingUp, Clock, CheckCircle, Target, Award, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color: 'purple' | 'blue' | 'green' | 'orange' | 'yellow';
  progress?: number;
}

const colorStyles = {
  purple: {
    bg: 'from-purple-500 to-purple-600',
    light: 'bg-purple-50 dark:bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-500/20',
  },
  blue: {
    bg: 'from-blue-500 to-blue-600',
    light: 'bg-blue-50 dark:bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-500/20',
  },
  green: {
    bg: 'from-green-500 to-green-600',
    light: 'bg-green-50 dark:bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-500/20',
  },
  orange: {
    bg: 'from-orange-500 to-orange-600',
    light: 'bg-orange-50 dark:bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-500/20',
  },
  yellow: {
    bg: 'from-yellow-500 to-yellow-600',
    light: 'bg-yellow-50 dark:bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-500/20',
  },
};

const KPICard = ({ title, value, subtitle, icon, trend, color, progress }: KPICardProps) => {
  const styles = colorStyles[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative overflow-hidden rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300"
    >
      {/* Gradient Background Accent */}
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${styles.bg} opacity-5 rounded-full blur-3xl group-hover:opacity-10 transition-opacity`} />
      
      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl ${styles.light} ${styles.border} border`}>
            <div className={styles.text}>
              {icon}
            </div>
          </div>
          
          {trend && (
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
              trend.isPositive 
                ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' 
                : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
            }`}>
              {trend.isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              {trend.value}
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          {title}
        </h3>

        {/* Value */}
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-4xl font-bold text-gray-900 dark:text-white">
            {value}
          </span>
        </div>

        {/* Subtitle */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          {subtitle}
        </p>

        {/* Progress Bar (if applicable) */}
        {progress !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400">Target: 4.0</span>
              <span className={`font-medium ${styles.text}`}>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full bg-gradient-to-r ${styles.bg} rounded-full`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hover Border Effect */}
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${styles.bg} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} 
           style={{ padding: '1px', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} 
      />
    </motion.div>
  );
};

export const KPICards = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
      {/* Current GPA */}
      <KPICard
        title="Current GPA"
        value="3.7"
        subtitle="Target: 4.0"
        icon={<TrendingUp className="w-5 h-5" />}
        color="purple"
        progress={92.5}
        trend={{ value: "+0.2", isPositive: true }}
      />

      {/* Assignments Due */}
      <KPICard
        title="Assignments Due"
        value="3"
        subtitle="This week"
        icon={<Clock className="w-5 h-5" />}
        color="orange"
        trend={{ value: "-2", isPositive: true }}
      />

      {/* Assignments Done */}
      <KPICard
        title="Assignments Done"
        value="18"
        subtitle="This semester"
        icon={<CheckCircle className="w-5 h-5" />}
        color="green"
        trend={{ value: "+3", isPositive: true }}
      />

      {/* Quizzes Done */}
      <KPICard
        title="Quizzes Done"
        value="6"
        subtitle="This semester"
        icon={<Target className="w-5 h-5" />}
        color="blue"
      />

      {/* Average Score */}
      <KPICard
        title="Average Score"
        value="87%"
        subtitle="+5% from last month"
        icon={<Award className="w-5 h-5" />}
        color="yellow"
        trend={{ value: "+5%", isPositive: true }}
      />
    </div>
  );
};

export default KPICards;