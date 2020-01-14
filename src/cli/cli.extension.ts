import cliProvider from './cli.provider';
import { PaperExt } from '../paper';
import { BitExt } from '../bit';
import { Extension } from '../harmony';

export default Extension.instantiate({
  name: 'BitCli',
  dependencies: [PaperExt, BitExt],
  config: {},
  provider: cliProvider
});