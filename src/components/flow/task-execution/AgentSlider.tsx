/**
 * Agent Slider Component
 *
 * 최대 에이전트 수 슬라이더 UI
 */

import { Slider } from '@/components/ui/slider'

export interface AgentSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export function AgentSlider({ value, onChange, min = 1, max = 10 }: AgentSliderProps) {
  return (
    <div>
      <label className="text-sm font-medium mb-2 block flex items-center justify-between">
        <span>최대 에이전트 수</span>
        <span className="text-muted-foreground">{value}</span>
      </label>
      <Slider
        value={[value]}
        onValueChange={([v]: number[]) => onChange(v)}
        min={min}
        max={max}
        step={1}
        className="mt-2"
      />
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{min} (빠름)</span>
        <span>{max} (병렬)</span>
      </div>
    </div>
  )
}
