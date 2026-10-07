import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { BmiCalculator } from '@omniwell/tracker-bmi/BmiCalculator'
import { BMI_TOOL } from '@/lib/trackers'

export const metadata: Metadata = { title: 'BMI calculator' }

export default function BmiPage() {
  return (
    <>
      <PageHeader title={BMI_TOOL.name} description={BMI_TOOL.description} icon={BMI_TOOL.icon} accent={BMI_TOOL.accent} />
      <BmiCalculator />
    </>
  )
}
