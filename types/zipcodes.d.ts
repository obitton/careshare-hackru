declare module 'zipcodes' {
  const zipcodes: {
    radius(zip: string, miles?: number): string[];
    lookup(zip: string): any;
    distance(zip1: string, zip2: string): number;
  };
  export default zipcodes;
}
