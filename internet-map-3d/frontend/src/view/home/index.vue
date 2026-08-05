<script setup lang="ts">
import ixMapImg from '@/assets/img/ixMap.png'
import uploadMapImg from '@/assets/img/uploadMap.png'
import dashboardImg from '@/assets/img/dashboard.png'
import pluginImg from '@/assets/img/plugin.png'

</script>

<template>
  <el-row>
    <el-col>
      <section class="jumbotron text-center">
        <div class="container">
          <h1>INTERNET MAP 3D</h1>
          <p class="lead text-muted">This is a work-in-progress prototype of the internet-map..</p>
        </div>
      </section>
    </el-col>
  </el-row>
  <el-row class="menu" style="padding: 20px 0" :justify="'center'">
    <el-col :span="22">
      <ul style="
        display: grid;grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        list-style: none;
        padding: 0;
        margin: 0;"
      >
        <li>
          <router-link
              :to="{ name: 'ixMap3D'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="Similar to the map page in function, the difference lies in the display dimension. IXMap only shows up to the IX dimension and does not display the Host at a deeper level."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>IX MAP</h3>
                </template>
                <el-image :src="ixMapImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'uploadMap'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="Compared with Internet Map, the data source is the docker-compose.yml file of the uploaded SEED simulator. Of course, this data source merely displays the network structure and other functions such as terminals are not available."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>Upload MAP</h3>
                </template>
                <el-image :src="uploadMapImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'dashboard'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="seedemu dashboard, displays current emulator nodes and networks."
                placement="bottom"
            >
              <el-card>
                <template #header>
                  <h3>DASHBOARD</h3>
                </template>
                <el-image :src="dashboardImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'plugin'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="Plugin installation page."
                placement="bottom"
            >
              <el-card>
                <template #header>
                  <h3>PLUGIN</h3>
                </template>
                <el-image :src="pluginImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
      </ul>
    </el-col>
  </el-row>
</template>

<style scoped lang="scss">
.jumbotron {
  padding: 2rem 1rem;
  margin-bottom: 2rem;
  background-color: #e9ecef;
  border-radius: .3rem;
}

@media (min-width: 576px) {
  .jumbotron {
    padding: 4rem 2rem;
  }
}

.container {
  text-align: center;
}

.menu a {
  text-decoration: none;
}
</style>
