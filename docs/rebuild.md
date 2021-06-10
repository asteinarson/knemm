## [Back to index](index.md)

# rebuild

```
knemm rebuild -s state_dir
```
This commands will rebuild a specified state directory, from the claims it is made from. In a normal work flow this command is not needed. 


## Example
```bash 
$ ls my-app-state
Person_1.yaml  Person_2.yaml  Product_1.yaml Product_2.yaml 
Product_3.yaml Product_4.yaml ___merge.yaml 
$ rm my-app-state/___merge.yaml 
$ knemm rebuild -s my-app-state 
$ ls my-app-state/___merge.yaml
my-app-state/___merge.yaml
```


## Options

None. 