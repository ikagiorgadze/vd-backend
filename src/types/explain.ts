export type IndexMeta = {
  index_code: string;
  name: string;
  question: string;
  definition: string;
};

export type IndexData  = {
  year: number;
  observation: number;
}

export type Index = {
  name: string;
  data: IndexData[];
}

export type ExplainRequest = {
  
  indexA: Index;
  indexB: Index;
  country: string;
  execute?: boolean;
};

export type Correlation = {
  r: number;
  n?: number;
  method?: string;
  p_value?: number;
  start_year?: number;
  end_year?: number;
};

export type CorrelationPair = {
  indexA: string;
  indexB: string;
  r: number;
  n: number;
  p_value: number;
};

export type CorrelationsRequest = {
  country: string;
  type: 'highest' | 'lowest' | 'strongest' | 'weakest' | 'most_significant' | 'least_significant' | 'most_observations' | 'fewest_observations';
  dataset1: 'VDEM' | 'WEO' | 'NEA';
  dataset2: 'VDEM' | 'WEO' | 'NEA';
  minObservations?: number;
  limit?: number; // Ignored - always returns 3 pairs
};

export type CorrelationsResponse = {
  correlations: CorrelationPair[];
};

export type ExplainResponse = {
  prompt: string;
  context: {
    indexA: IndexMeta;
    indexB: IndexMeta;
    country: string;
    correlation: {
      r: number;
      n?: number;
      method?: string;
      p_value?: number;
      yearsCovered?: [number, number];
    } | null;
  };
  model: string;
  explanation?: string;
};
