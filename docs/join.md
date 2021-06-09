## [Back to index](index.md)

# join

```
knemm join [options] [claims...]
```
The command will join together (merge) a combination of: 
  * A **state** 
  * A number of **claims** 

The state is optional and there can only be one state as input to a **join** command and it is always used first in the merge process (i.e. all claims are applied on top of it).

A state can come from one of: 

  * the result of previous merging of claims: 
    * Such as from a `knemm` state directory.
    * Or piped via **stdin** from a connected `knemm join` command.
  * Any live database schema can be converted to a state. 

The claims will be sorted in dependency order: 
  * For claims in the same module, the claims are processed in increasing version order
  * For dependencies, the dependendcy modules (up to the specified version) are processed (merged) before the dependent one. 
    * Claims can have nested dependencies. 

## Example
```
$ knemm join my-app-state/ Person_2.yaml Product_4.yaml 
```

The example will look for a state (a `___merge.yaml`) in directory `my-app-state` and merge any claims in the `Person` and `Product` modules (up to version 2 and 4). Since we have not specified a directory to write the resulting state, it is echoed to **stdout**. 

If we want to read and store the state on disk, we use the `-s` option, with a directory name: 

```
$ knemm join -s my-app-state/ Person_2.yaml Product_4.yaml 
```

If the state did not exist before, the directory is initialized as an empty state, before merging the claims. 

## Options

| Short form | Long form | Explanation | 
| --- | --- | --- | 
| `-s <dir>` | `--state <dir>` | Where to read and store the joined state | 
| `-p <paths>` | `--path <paths>` | Additional paths, where to look for dependency claims. (By default all directories given in claim paths are searched - so this is rarely needed) | 
| `-N ` | `--no-deps` | Skip looking for dependencies in merge phase (usually for debug) | 
| `-L` | `--loose-names` | Allow arbitrarily named claims (the name is declared inside the claim). This can decrease performance as it forces `knemm` to try to parse any YAML/JSON file in known directories. | 
| `-T <xti file>` | `--xti <xti file>` | Read extra type info from this file. This is usually automatichally handled.  | 
| `-i` | `--internal` | Generate output in **internal** format (not **hrc**)  | 
| `-j` | `--json` | Generate output in **JSON** format (not **YAML**)  | 
| `-X <patterns>` | `--exclude <patterns>` | Exclude tables/columns based on these patterns | 
| `-I <patterns>` | `--include <patterns>` | Include tables/columns based on these patterns | 
| `-D` | `--dry` | Do not modify the state after merging  | 

## Result
On successful parsing and merging of a state and claims, it will echo the resulting state to **stdout** (the `___tables` section of it). 

In case of errors, each error is printed on its own line. 

### Exit codes
The exit code is `0` if sucessful. Otherwise a specific number, depending on the type of error, usually beginning at 100. 


