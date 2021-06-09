## [Back to index](index.md)

# apply

```
knemm apply [options] [claims...]
```
The command  of: 
  * A **state** 
  * A number of **claims** 


## Example
```
$ knemm apply -s my-app-state Person_2.yaml Product_4.yaml 
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
| `-p <paths>` | `--path <paths>` | Additional paths, where to look for dependency claims. |

